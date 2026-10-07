"use client";

import { AlertCircle, Loader2, Moon, RotateCcw, Sun } from "lucide-react";
import { useState } from "react";

import { saveAppearance } from "@/app/(dashboard)/appearance/actions";
import { BrandEditor } from "@/components/appearance/brand-editor";
import { HomeEditor } from "@/components/appearance/home-editor";
import { PhonePreview } from "@/components/appearance/phone-preview";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useFormAction } from "@/hooks/use-form-action";
import { describeErrorPath, HOME_PAGE, pageTabs } from "@/lib/appearance";
import type { AdminAppearance, Appearance, AppearanceProduct, Brand, Category } from "@/lib/types";

function toConfig({ appName, logoUrl, theme, announcement, categoryTabs, homeSections }: Appearance): Appearance {
  return { appName, logoUrl, theme, announcement, categoryTabs, homeSections };
}

const isHomePath = (path: string) => path.startsWith("homeSections") || path.startsWith("categoryTabs") || path.startsWith("announcement");

type EditorTab = "brand" | "home";

type AppearanceEditorProps = {
  initial: AdminAppearance;
  categories: Category[];
  brands: Brand[];
  products: AppearanceProduct[];
  initialTab: EditorTab;
  initialExpanded: string | null;
  initialPage: string | null;
};

/** Keeps the open tab, section and tab page in the URL, so they survive the reload after saving. */
function syncUrl(tab: EditorTab, section: string | null, page: string) {
  const params = new URLSearchParams();
  if (tab === "home") params.set("tab", "home");
  if (tab === "home" && page !== HOME_PAGE) params.set("page", page);
  if (tab === "home" && section) params.set("section", section);
  const query = params.toString();
  window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
}

export function AppearanceEditor({ initial, categories, brands, products, initialTab, initialExpanded, initialPage }: AppearanceEditorProps) {
  const [saved] = useState(() => toConfig(initial));
  const [draft, setDraft] = useState(saved);
  const [tab, setTabState] = useState<EditorTab>(initialTab);
  const [expanded, setExpandedState] = useState<string | null>(initialExpanded);
  const [pageState, setPageState] = useState(initialPage ?? HOME_PAGE);
  const page = pageTabs(draft, categories).some((item) => item.tab.id === pageState) ? pageState : HOME_PAGE;

  const setTab = (next: string) => {
    const value: EditorTab = next === "home" ? "home" : "brand";
    setTabState(value);
    syncUrl(value, expanded, page);
  };
  const setExpanded = (next: string | null) => {
    setExpandedState(next);
    syncUrl(tab, next, page);
  };
  const setPage = (next: string) => {
    setPageState(next);
    setExpandedState(null);
    syncUrl(tab, null, next);
  };
  const editSection = (id: string) => {
    setTabState("home");
    setExpandedState(id);
    syncUrl("home", id, page);
  };
  const [previewDark, setPreviewDark] = useState(initial.theme.colorScheme === "dark");
  const { pending, fieldErrors, onSubmit, reset } = useFormAction(saveAppearance);

  const config = JSON.stringify(draft);
  const dirty = config !== JSON.stringify(saved);
  const errorEntries = Object.entries(fieldErrors);
  const homeErrors = errorEntries.some(([path]) => isHomePath(path));
  const brandErrors = errorEntries.some(([path]) => !isHomePath(path));
  const scheme = draft.theme.colorScheme;
  const dark = scheme === "system" ? previewDark : scheme === "dark";

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_340px]">
      <form onSubmit={onSubmit} className="flex min-w-0 flex-col gap-4">
        <input type="hidden" name="config" value={config} />

        {errorEntries.length > 0 && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertTitle>Some changes need fixing before they can be saved</AlertTitle>
            <AlertDescription>
              <ul className="list-disc pl-4">
                {errorEntries.slice(0, 6).map(([path, message]) => (
                  <li key={path}>
                    {describeErrorPath(path) || "Appearance"}: {message}
                  </li>
                ))}
                {errorEntries.length > 6 && <li>and {errorEntries.length - 6} more</li>}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="brand">
              Brand and style
              {brandErrors && <span className="size-1.5 rounded-full bg-destructive" aria-label="has errors" />}
            </TabsTrigger>
            <TabsTrigger value="home">
              Home screen
              {homeErrors && <span className="size-1.5 rounded-full bg-destructive" aria-label="has errors" />}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="brand" className="mt-2">
            <BrandEditor value={draft} onChange={setDraft} errors={fieldErrors} />
          </TabsContent>
          <TabsContent value="home" className="mt-2">
            <HomeEditor
              value={draft}
              onChange={setDraft}
              categories={categories}
              brands={brands}
              products={products}
              errors={fieldErrors}
              expanded={expanded}
              onExpand={setExpanded}
              page={page}
              onPageChange={setPage}
            />
          </TabsContent>
        </Tabs>

        <div className="sticky bottom-0 z-10 -mx-1 flex items-center gap-2 border-t bg-background/95 px-1 py-3 backdrop-blur">
          <Button type="submit" disabled={pending || !dirty}>
            {pending && <Loader2 className="animate-spin" />}
            Save appearance
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={pending || !dirty}
            onClick={() => {
              setDraft(saved);
              reset();
            }}
          >
            <RotateCcw />
            Discard changes
          </Button>
          <span className="ml-auto text-xs text-muted-foreground">{dirty ? "Unsaved changes" : initial.updatedAt ? "All changes saved" : "Using the default appearance"}</span>
        </div>
      </form>

      <aside className="flex flex-col gap-3 lg:sticky lg:top-4 lg:self-start">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Live preview</p>
          {scheme === "system" ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setPreviewDark((value) => !value)}>
              {previewDark ? <Sun /> : <Moon />}
              {previewDark ? "Light" : "Dark"}
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">{scheme === "dark" ? "Dark" : "Light"} mode</span>
          )}
        </div>
        <PhonePreview
          appearance={draft}
          categories={categories}
          brands={brands}
          dark={dark}
          page={page}
          onPageChange={setPage}
          selectedSection={tab === "home" ? expanded : null}
          onSelectSection={editSection}
        />
        <p className="text-center text-xs text-muted-foreground">Click a section to edit it. Product cards show placeholders; the app fills them from each store&apos;s stock.</p>
      </aside>
    </div>
  );
}
