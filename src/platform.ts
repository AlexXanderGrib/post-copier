export interface Source {
  readonly id: string;
  readonly title: string;
  readonly image?: string;
  readonly domain?: string;
}

export enum FileType {
  IMAGE = "image",
  VIDEO = "video",
  AUDIO = "audio",
  LINK = "link",
  DOCUMENT = "document",
  UNSUPPORTED = "unsupported"
}

export interface File {
  readonly type: FileType;
  readonly id: string;
  readonly raw: unknown;
  readonly url?: string;
}

export interface PostContent {
  readonly text: string;
  readonly files: File[];
}

export interface Post extends PostContent {
  readonly id: number;
  readonly source: Source;
  readonly date: Date;
}

export interface Platform {
  authenticate(): Promise<void>;
  getSources(): Promise<Source[]>;
  getDestinations(): Promise<Source[]>;
  getPosts(source: Source): Promise<Post[]>;
  getFileContents(file: File): Promise<Buffer>;
  post(sourceId: Source["id"], content: PostContent): Promise<Post["id"]>;
  uploadFile(type: FileType, contents: Buffer): Promise<File>;
}
