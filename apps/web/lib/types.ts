/** The parts of GET /settings the website uses. */
export type PublicSettings = {
  appName: string;
  branding: { logoUrl: string | null };
  theme: { colors: { primary: string; onPrimary: string; accent: string; onAccent: string } };
  timezone: string;
  currency: string;
  payments: { methods: ("COD" | "ONLINE")[] };
};

/** GET /products/:id/preview: what a shared product link shows. */
export type ProductPreview = {
  id: string;
  name: string;
  description: string | null;
  brand: string | null;
  imageUrl: string | null;
  /** The cheapest variant in stock, null while nothing is; `varies` when other variants cost more. */
  price: { price: string; compareAtPrice: string | null; label: string; varies: boolean } | null;
};

/** Business details on the website; `name` falls back to the app name. */
export type PolicyBusiness = {
  appName: string;
  logoUrl: string | null;
  name: string;
  address: string | null;
  email: string | null;
  phone: string | null;
};

/** Where to get an app. `download` is only set while the app has no store listing. */
export type AppLinks = {
  playStore: string | null;
  appStore: string | null;
  download: string | null;
};

/** GET /settings/website: home page details and policy page titles. */
export type Website = {
  business: PolicyBusiness;
  tagline: string | null;
  /** Null for an app with no links. */
  apps: { customer: AppLinks | null };
  pages: { slug: string; title: string; updatedAt: string | null }[];
};

/** A policy page with its placeholders filled in. `updatedAt` is null while it shows the template. */
export type PolicyPage = {
  slug: string;
  title: string;
  body: string;
  updatedAt: string | null;
  business: PolicyBusiness;
};

export type HomeCategory = { id: string; name: string; slug: string; imageUrl: string | null };

export type HomeLink = { type: "none" } | { type: "category"; category: HomeCategory };

/** A coloured band behind a section, as set in Appearance. */
export type SectionBackground = { color: string; textColor: string; edge: "straight" | "zigzag" | "wave" } | null;

type SectionBase = { id: string; background: SectionBackground };
type Titled = { title: string | null; description: string | null };

/** The home sections the website shows. Product, deal, brand and buy-again sections are skipped. */
export type HomeSection = SectionBase &
  (
    | { type: "banner_carousel"; autoplay: boolean; banners: { id: string; imageUrl: string; title: string | null; subtitle: string | null; link: HomeLink }[] }
    | ({ type: "category_grid"; columns: number; categories: HomeCategory[] } & Titled)
    | ({ type: "subcategory_grid"; columns: number; category: HomeCategory; categories: HomeCategory[] } & Titled)
    | ({
        type: "category_collection";
        columns: number;
        items: { id: string; label: string; imageUrl: string | null; badge: string | null; category: HomeCategory }[];
      } & Titled)
    | ({ type: "image_tiles"; layout: "grid" | "carousel"; columns: number; tiles: { id: string; imageUrl: string; link: HomeLink; buttonLabel: string | null }[] } & Titled)
    | { type: "offer_strip"; title: string; subtitle: string | null; imageUrl: string | null; backgroundColor: string; textColor: string; link: HomeLink }
  );

/** GET /home. Other section types may appear and are skipped. */
export type HomeFeed = { sections: (HomeSection | (SectionBase & { type: string }))[] };
