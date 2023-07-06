import { useCache } from "./cache.js";
import {
  Source,
  Post,
  Platform,
  File,
  FileType,
  PostContent
} from "./platform.js";
import { CallbackService, VK, createCollectIterator, Objects } from "vk-io";
import {
  DirectAuthorization,
  officialAppCredentials
} from "@vk-io/authorization";
import { env } from "./env.js";
import { ask } from "./prompt.js";
import { solver } from "./captcha.js";
import fetch from "node-fetch";

export class VkPlatform implements Platform {
  #authCache = useCache<string>("VK_TOKEN");
  #client!: VK;

  async authenticate(): Promise<void> {
    let token = this.#authCache.value;
    const apiVersion = env("VK_API_VERSION", "1.135");

    if (!token) {
      const callbackService = new CallbackService();
      callbackService.onTwoFactor(async (payload, retry) => {
        const code = await ask(`Code (sentVia=${payload.type})? `);
        await retry(code);
      });

      callbackService.onCaptcha(async (captcha, retry) => {
        const response = await fetch(captcha.src);
        const image = Buffer.from(await response.arrayBuffer());

        const answer = await solver.imageCaptcha(image.toString("base64"), {
          regsense: 1,
          min_len: 4,
          max_len: 7,
          language: 2,
          phrase: 0
        });

        await retry(answer.data);
      });

      const auth = new DirectAuthorization({
        apiVersion,
        callbackService,
        scope: "all",

        login: await ask("Login? "),
        password: await ask("Password? "),

        ...officialAppCredentials.iphone
      });

      const result = await auth.run();
      token = result.token;
      this.#authCache.value = token;
    }

    this.#client = new VK({ token, apiVersion });
  }

  async getSources(): Promise<Source[]> {
    const iterator = createCollectIterator<Objects.GroupsGroupFull>({
      api: this.#client.api,
      method: "groups.get",
      countPerRequest: 1000,
      params: {
        extended: 1
      }
    });

    const sources: Source[] = [];

    for await (const { items } of iterator) {
      for (const group of items) {
        sources.push({
          domain: group.screen_name,
          id: (-group.id!).toString(),
          title: group.name!,
          image: group.photo_200!
        });
      }
    }

    const destinations = await this.getDestinations();
    const destinationIds = new Set(destinations.map((d) => d.id));

    return sources.filter((source) => !destinationIds.has(source.id));
  }

  async getDestinations(): Promise<Source[]> {
    const iterator = createCollectIterator<Objects.GroupsGroupFull>({
      api: this.#client.api,
      method: "groups.get",
      countPerRequest: 1000,
      params: {
        extended: 1,
        filter: "editor"
      }
    });

    const sources: Source[] = [];

    for await (const { items } of iterator) {
      for (const group of items) {
        sources.push({
          domain: group.screen_name,
          id: (-group.id!).toString(),
          title: group.name!,
          image: group.photo_200!
        });
      }
    }

    return sources;
  }

  async getPosts(source: Source): Promise<Post[]> {
    const iterator = createCollectIterator<Objects.WallWallpostFull>({
      api: this.#client.api,
      method: "wall.get",
      countPerRequest: 100,
      maxCount: 100,
      params: {
        owner_id: parseInt(source.id),
        extended: true
      }
    });

    const posts: Post[] = [];

    const typesMap: Record<string, FileType> = {
      photo: FileType.IMAGE,
      video: FileType.VIDEO,
      audio: FileType.AUDIO,
      doc: FileType.DOCUMENT,
      graffiti: FileType.IMAGE,
      link: FileType.LINK
    };

    for await (const { items } of iterator) {
      for (const post of items) {
        const files =
          post.attachments?.map((attachment: any) => {
            const { type } = attachment;
            const raw = attachment[type];
            const { owner_id, id, access_key } = raw;
            const parts = [owner_id, id];
            if (access_key) parts.push(access_key);

            return {
              id: parts.join("_"),
              type: typesMap[type] ?? FileType.UNSUPPORTED,
              raw
            };
          }) ?? [];

        posts.push({
          id: post.id ?? post.post_id ?? 0,
          date: new Date((post.date ?? 0) * 1000),
          text: post.text ?? "",
          source,
          files
        });
      }
    }

    return posts;
  }

  async getFileContents(file: File): Promise<Buffer> {
    let url = "";

    switch (file.type) {
      case FileType.IMAGE:
        url = (
          (file.raw as any).sizes as Required<Objects.PhotosPhotoSizes>[]
        ).reduce((a, b) =>
          a.width * a.height > b.width * b.height ? a : b
        ).url;
        break;

      case FileType.DOCUMENT:
        url = (file.raw as any).url;
        break;
    }

    if (!url) {
      throw new Error("Unable to download this file");
    }

    const response = await fetch(url);
    return Buffer.from(await response.arrayBuffer());
  }

  async post(sourceId: string, content: PostContent): Promise<number> {
    const { post_id } = await this.#client.api.wall.post({
      owner_id: parseInt(sourceId),
      message: content.text,
      attachments: content.files.map((file) => file.id)
    });

    return post_id;
  }

  async uploadFile(type: FileType, contents: Buffer): Promise<File> {
    const { api, upload } = this.#client;
    const [me] = await api.users.get({});
    const options = { peer_id: me.id as number, source: { value: contents } };

    const methods: Partial<Record<FileType, () => Promise<unknown>>> = {
      [FileType.DOCUMENT]: () =>
        upload.messageDocument({
          ...options
        }),
      [FileType.IMAGE]: () =>
        upload.messagePhoto({
          ...options
        })
    };

    return {
      id: "",
      raw: methods,
      type
    };
  }
}
