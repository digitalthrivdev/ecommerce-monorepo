import { randomBytes } from "node:crypto";

import type { FastifyBaseLogger } from "fastify";
import type { Redis } from "ioredis";

import type { PrismaClient } from "../../generated/prisma/client";
import { AppError } from "../../shared/errors.js";
import { createProductsService } from "../products/products.service.js";
import { downloadImage } from "../uploads/image-download.js";
import type { createImageStore } from "../uploads/image-store.js";
import type { CatalogImportService, ImportPlan, ImportResult, RowError, WrittenProduct } from "./catalog-import.service.js";

const LOCK_KEY = "catalog-import:running";
/** Ids of the latest imports, newest first. */
const RECENT_KEY = "catalog-import:recent";
const MAX_RECENT = 20;
const jobKey = (id: string) => `catalog-import:${id}`;
/** A running import refreshes the lock after every batch and image; without that it counts as interrupted. */
const LOCK_SECONDS = 15 * 60;
const JOB_SECONDS = 7 * 24 * 60 * 60;
const MAX_LISTED = 500;
const IMAGE_WORKERS = 4;

export type ImportJob = {
  id: string;
  status: "running" | "done" | "failed" | "interrupted";
  phase: "catalog" | "images" | "finished";
  progress: { done: number; total: number };
  startedAt: string;
  heartbeatAt: string;
  finishedAt: string | null;
  result: ImportResult;
  error: string | null;
};

type ImageStore = ReturnType<typeof createImageStore>;

type ImageTask = { productId: string; variantId: string | null; url: string; rows: number[] };

/** Images for products saved in this run: one per address, shown for every size unless one size alone uses it. */
function imageTasks(written: WrittenProduct[]) {
  const tasks: ImageTask[] = [];
  for (const product of written) {
    const rowsByUrl = new Map<string, { row: number; sku: string }[]>();
    for (const row of product.group.rows) {
      if (row.data.image_url) rowsByUrl.set(row.data.image_url, [...(rowsByUrl.get(row.data.image_url) ?? []), { row: row.row, sku: row.data.sku }]);
    }
    for (const [url, rows] of rowsByUrl) {
      const shared = !product.hasOptions || rows.length > 1;
      tasks.push({
        productId: product.productId,
        variantId: shared ? null : (product.variantIdBySku.get(rows[0]!.sku) ?? null),
        url,
        rows: rows.map((row) => row.row),
      });
    }
  }
  return tasks;
}

export function createImportJobs(deps: {
  prisma: PrismaClient;
  redis: Redis;
  service: CatalogImportService;
  imageStore: ImageStore;
  log: FastifyBaseLogger;
}) {
  const { prisma, redis, service, imageStore, log } = deps;
  const products = createProductsService(prisma);

  async function save(job: ImportJob) {
    job.heartbeatAt = new Date().toISOString();
    await redis.set(jobKey(job.id), JSON.stringify(job), "EX", JOB_SECONDS);
    if (job.status === "running") await redis.expire(LOCK_KEY, LOCK_SECONDS);
  }

  async function release(id: string) {
    await redis.eval("if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) end return 0", 1, LOCK_KEY, id);
  }

  async function addImages(job: ImportJob, written: WrittenProduct[], baseUrl: string) {
    const tasks = imageTasks(written);
    if (tasks.length === 0) return;
    job.phase = "images";
    job.progress = { done: 0, total: tasks.length };
    await save(job);

    // An image from the file is only added where there was none, so re-imports don't re-download or pile up copies.
    const before = await prisma.productImage.findMany({
      where: { productId: { in: [...new Set(tasks.map((task) => task.productId))] } },
      select: { productId: true, variantId: true },
    });
    const hadImage = new Set(before.map((image) => `${image.productId}:${image.variantId ?? ""}`));

    // Downloads run in parallel; conversion runs one image at a time, like uploads.
    let converting: Promise<unknown> = Promise.resolve();
    const convert = (input: Buffer) => {
      const next = converting.then(() => imageStore.saveImage(input));
      converting = next.catch(() => undefined);
      return next;
    };
    const keyByUrl = new Map<string, Promise<string>>();
    const fetchImage = (url: string) => {
      let key = keyByUrl.get(url);
      if (!key) {
        key = downloadImage(url).then(convert).then((saved) => saved.key);
        keyByUrl.set(url, key);
      }
      return key;
    };

    const queue = [...tasks];
    const worker = async () => {
      for (let task = queue.shift(); task; task = queue.shift()) {
        if (hadImage.has(`${task.productId}:${task.variantId ?? ""}`)) {
          job.result.imagesSkipped++;
        } else {
          try {
            const url = `${baseUrl}/uploads/${await fetchImage(task.url)}`;
            // Files are named by content, so the same URL means the product already shows this picture.
            const duplicate = await prisma.productImage.findFirst({ where: { productId: task.productId, url }, select: { id: true } });
            if (duplicate) {
              job.result.imagesSkipped++;
            } else {
              await products.addImage(task.productId, { url, altText: null, variantId: task.variantId });
              job.result.imagesAdded++;
            }
          } catch (error) {
            if (!(error instanceof AppError)) log.error({ err: error, url: task.url }, "Catalog import image failed");
            const message = error instanceof AppError ? error.message : "The image could not be added";
            job.result.imagesFailed++;
            for (const row of task.rows) {
              if (job.result.warnings.length < MAX_LISTED) job.result.warnings.push({ row, column: "image_url", message });
            }
          }
        }
        job.progress.done++;
        await save(job);
      }
    };
    await Promise.all(Array.from({ length: IMAGE_WORKERS }, worker));
  }

  async function run(job: ImportJob, plan: ImportPlan, context: { changedById: string; baseUrl: string }) {
    const refs = await service.prepareReferences(plan);
    job.result.categoriesCreated = refs.categoriesCreated;
    job.result.brandsCreated = refs.brandsCreated;

    const written: WrittenProduct[] = [];
    await service.writeProducts(
      plan,
      refs,
      context.changedById,
      async (done, batch, failed) => {
        written.push(...batch);
        for (const product of batch) {
          job.result[product.created ? "productsCreated" : "productsUpdated"]++;
          job.result.variantsCreated += product.variantsCreated;
          job.result.variantsUpdated += product.variantsUpdated;
          job.result.stockChanged += product.stockChanged;
        }
        for (const failure of failed) {
          if (job.result.failedProducts.length < MAX_LISTED) job.result.failedProducts.push(failure);
        }
        job.progress.done = done;
        await save(job);
      },
      (error) => log.error({ err: error }, "Catalog import product failed"),
    );

    await addImages(job, written, context.baseUrl);
  }

  /** Starts the import in the background. Only one import runs at a time. */
  async function start(plan: ImportPlan, context: { changedById: string; baseUrl: string }) {
    const id = randomBytes(12).toString("hex");
    const locked = await redis.set(LOCK_KEY, id, "EX", LOCK_SECONDS, "NX");
    if (!locked) {
      throw new AppError(409, "IMPORT_RUNNING", "Another import is still running. Wait for it to finish.");
    }

    const now = new Date().toISOString();
    const job: ImportJob = {
      id,
      status: "running",
      phase: "catalog",
      progress: { done: 0, total: plan.groups.length },
      startedAt: now,
      heartbeatAt: now,
      finishedAt: null,
      result: {
        productsCreated: 0,
        productsUpdated: 0,
        variantsCreated: 0,
        variantsUpdated: 0,
        categoriesCreated: 0,
        brandsCreated: 0,
        stockChanged: 0,
        imagesAdded: 0,
        imagesSkipped: 0,
        imagesFailed: 0,
        failedProducts: [] as RowError[],
        warnings: [] as RowError[],
      },
      error: null,
    };
    await save(job);
    await redis.multi().lpush(RECENT_KEY, id).ltrim(RECENT_KEY, 0, MAX_RECENT - 1).expire(RECENT_KEY, JOB_SECONDS).exec();

    void run(job, plan, context)
      .then(() => {
        job.status = "done";
      })
      .catch((error: unknown) => {
        log.error({ err: error }, "Catalog import failed");
        job.status = "failed";
        job.error = error instanceof AppError ? error.message : "The import stopped because of an unexpected error. Products saved so far are complete; run the import again to finish.";
      })
      .then(async () => {
        job.phase = "finished";
        job.finishedAt = new Date().toISOString();
        await save(job);
      })
      .catch((error: unknown) => log.error({ err: error }, "Could not save the catalog import result"))
      .finally(() => release(id).catch(() => undefined));

    return job;
  }

  function parse(stored: string) {
    const job = JSON.parse(stored) as ImportJob;
    // The process stopped (e.g. a restart) without finishing.
    if (job.status === "running" && Date.now() - Date.parse(job.heartbeatAt) > LOCK_SECONDS * 1000) {
      job.status = "interrupted";
      job.error = "The import stopped before finishing (the server restarted). Products saved so far are complete; run the import again to finish.";
    }
    return job;
  }

  async function get(id: string) {
    const stored = await redis.get(jobKey(id));
    if (!stored) {
      throw new AppError(404, "IMPORT_NOT_FOUND", "Import not found");
    }
    return parse(stored);
  }

  /** The latest imports kept (up to 20, at most 7 days old), without their lists of problems. */
  async function list() {
    const ids = await redis.lrange(RECENT_KEY, 0, MAX_RECENT - 1);
    const stored = ids.length > 0 ? await redis.mget(ids.map(jobKey)) : [];
    const items = stored.flatMap((value) => {
      if (!value) return [];
      const { result, ...job } = parse(value);
      const { failedProducts, warnings: _warnings, ...counts } = result;
      return [{ ...job, result: { ...counts, productsFailed: failedProducts.length } }];
    });
    return { items };
  }

  return { start, get, list };
}
