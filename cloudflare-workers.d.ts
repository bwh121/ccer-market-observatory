declare module "cloudflare:workers" {
  type D1Binding = Parameters<(typeof import("drizzle-orm/d1"))["drizzle"]>[0];

  export const env: {
    DB?: D1Binding;
  };
}
