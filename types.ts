export interface scanResult {
  objects: ObjectsEntity[];
  total: number;
  time: string;
  type: "author" | "maintainer";
}
export interface ObjectsEntity {
  downloads: Downloads;
  dependents: number | string;
  updated: string;
  searchScore: number;
  package: Package;
  score: Score;
  flags: Flags;
}
export interface Downloads {
  monthly: number;
  weekly: number;
}
export interface Package {
  name: string;
  keywords?: (string | null)[] | null;
  version: string;
  sanitized_name: string;
  publisher: MaintainersEntityOrPublisher;
  maintainers?: (MaintainersEntityOrPublisher)[] | null;
  license?: string | null;
  date: string;
  links: Links;
  description?: string | null;
}
export interface MaintainersEntityOrPublisher {
  email: string;
  username: string;
}
export interface Links {
  npm: string;
  homepage?: string | null;
  repository?: string | null;
  bugs?: string | null;
}
export interface Score {
  final: number;
  detail: Detail;
}
export interface Detail {
  popularity: number;
  quality: number;
  maintenance: number;
}
export interface Flags {
  insecure: number;
}

export interface PackageInfo {
  _id?: string | null,
  _rev?: string | null,
  name: string,
  time: Version,
  "dist-tags"?: object | null,
  versions?: object | null,
  license?: string | null,
  maintainers?: Array<object> | null,
  readme?: string | null,
  readmeFilename?: string | null,
  homepage?: string | null,
  repository?: object | null,
  bugs?: object | null
}

export interface Version {
  created: string,
  modified: string,
  [key: string]: string
}
