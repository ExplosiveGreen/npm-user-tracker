import { Schema } from "effect";

// Runtime decoders for the npm registry's untrusted JSON. Structs ignore
// unknown fields, so registry additions don't break scans; every field the
// app actually reads is validated.

const Maintainer = Schema.Struct({
  email: Schema.String,
  username: Schema.String,
});

const Links = Schema.Struct({
  npm: Schema.String,
  homepage: Schema.optional(Schema.NullOr(Schema.String)),
  repository: Schema.optional(Schema.NullOr(Schema.String)),
  bugs: Schema.optional(Schema.NullOr(Schema.String)),
});

const RegistryPackage = Schema.Struct({
  name: Schema.String,
  keywords: Schema.optional(Schema.Array(Schema.NullOr(Schema.String))),
  version: Schema.String,
  sanitized_name: Schema.String,
  publisher: Maintainer,
  maintainers: Schema.optional(Schema.Array(Maintainer)),
  license: Schema.optional(Schema.NullOr(Schema.String)),
  date: Schema.String,
  links: Links,
  description: Schema.optional(Schema.NullOr(Schema.String)),
});

const SearchObject = Schema.Struct({
  downloads: Schema.Struct({
    monthly: Schema.Number,
    weekly: Schema.Number,
  }),
  dependents: Schema.Union([Schema.Number, Schema.String]),
  updated: Schema.String,
  searchScore: Schema.Number,
  package: RegistryPackage,
  score: Schema.Struct({
    final: Schema.Number,
    detail: Schema.Struct({
      popularity: Schema.Number,
      quality: Schema.Number,
      maintenance: Schema.Number,
    }),
  }),
  flags: Schema.optional(Schema.Struct({ insecure: Schema.Number })),
});

// One of the two search responses (`author:` / `maintainer:`). The registry
// payload carries no query kind, so the caller attaches `type` afterwards.
export const SearchResponse = Schema.Struct({
  objects: Schema.Array(SearchObject),
  total: Schema.Number,
  time: Schema.String,
});

export type SearchResponse = typeof SearchResponse.Type;

// Full package metadata is large; only the `time` map (version → release
// date) is decoded, straight off the extracted field.
export const PackageTime = Schema.Record(Schema.String, Schema.String);

export type PackageTime = typeof PackageTime.Type;
