"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { ImageIcon, Loader2, Upload } from "lucide-react";

import { uploadImage } from "@/app/(dashboard)/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = "image/jpeg,image/png,image/webp,image/avif,image/gif";

type ImageFieldProps = {
  id: string;
  label: string;
  /** Set for plain form submission; the URL is posted under this name. */
  name?: string;
  /** Controlled value; leave undefined and use `defaultValue` for an uncontrolled field. */
  value?: string;
  defaultValue?: string;
  onChange?: (url: string) => void;
  error?: string;
  description?: ReactNode;
  placeholder?: string;
  /** Shape of the preview. */
  shape?: "square" | "wide";
};

/** An image URL field with an upload button. Uploads are resized and stored by the API. */
export function ImageField({
  id,
  label,
  name,
  value,
  defaultValue = "",
  onChange,
  error,
  description,
  placeholder = "https://",
  shape = "square",
}: ImageFieldProps) {
  const [ownValue, setOwnValue] = useState(defaultValue);
  const [uploadError, setUploadError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);
  const url = value ?? ownValue;
  const message = uploadError ?? error;

  function update(next: string) {
    if (value === undefined) setOwnValue(next);
    onChange?.(next);
  }

  function upload(file: File) {
    setUploadError(undefined);
    if (file.size > MAX_BYTES) {
      setUploadError("Images can be at most 10 MB");
      return;
    }
    startTransition(async () => {
      const formData = new FormData();
      formData.set("file", file);
      const result = await uploadImage(formData);
      if (result.ok) update(result.url);
      else setUploadError(result.error);
    });
  }

  return (
    <Field data-invalid={Boolean(message)}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted text-muted-foreground",
            shape === "wide" ? "aspect-[2/1] w-24" : "size-12",
          )}
        >
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element -- uploaded or admin-entered URLs from any host
            <img src={url} alt="" className="size-full object-cover" />
          ) : (
            <ImageIcon className="size-5" />
          )}
        </div>
        <div className="flex min-w-0 flex-1 gap-2">
          <Input
            id={id}
            name={name}
            type="url"
            value={url}
            placeholder={placeholder}
            onChange={(event) => {
              setUploadError(undefined);
              update(event.target.value);
            }}
            aria-invalid={Boolean(message)}
          />
          <Button type="button" variant="outline" disabled={pending} onClick={() => fileInput.current?.click()}>
            {pending ? <Loader2 className="animate-spin" /> : <Upload />}
            {pending ? "Uploading" : "Upload"}
          </Button>
        </div>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) upload(file);
        }}
      />
      {description && <FieldDescription>{description}</FieldDescription>}
      <FieldError>{message}</FieldError>
    </Field>
  );
}
