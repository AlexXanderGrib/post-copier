import { useCache } from "./cache.js";
import {
  Source,
  Post,
  Platform,
  File,
  FileType,
  PostContent
} from "./platform.js";
import { TelegramClient } from "telegram";
import Session from "telegram/sessions/StringSession.js";
import { env } from "./env.js";
import { ask } from "./prompt.js";
import { match } from "ts-pattern";
import { CustomFile } from "telegram/client/uploads.js";
import { fileTypeFromBuffer } from "file-type";
import { createHash } from "crypto";

export class TelegramPlatform implements Platform {
  async getDestinations(): Promise<Source[]> {
    const result = await this.#client.getDialogs();

    return result
      .filter(
        (dialog) =>
          dialog.isChannel &&
          dialog.entity?.className === "Channel" &&
          dialog.entity.adminRights?.postMessages
      )
      .map((dialog) => ({
        id: dialog.id!.toString(),
        title: dialog.title!,
        domain: (dialog.entity as any).username
      }));
  }
  #authCache = useCache<string>("TELEGRAM_TOKEN");
  #client!: TelegramClient;

  async authenticate(): Promise<void> {
    const session = new Session.StringSession(this.#authCache.value);
    const client = new TelegramClient(
      session,
      parseInt(env("TELEGRAM_API_ID")),
      env("TELEGRAM_API_HASH"),
      {}
    );

    await client.start({
      phoneNumber: () => ask(`Phone number? `),
      phoneCode: (viaApp) => ask(`Code (viaApp=${viaApp})? `),
      password: (hint) => ask(`Password (${hint})? `),
      onError(error) {
        throw error;
      }
    });

    this.#client = client;
    this.#authCache.value = session.save();
  }

  async getSources(): Promise<Source[]> {
    const result = await this.#client.getDialogs();
    const destinations = await this.getDestinations();
    const destinationIds = new Set(destinations.map((d) => d.id));

    return result
      .filter(
        (dialog) =>
          dialog.isChannel && !destinationIds.has(dialog.id!.toString())
      )
      .map((dialog) => ({
        id: dialog.id!.toString(),
        title: dialog.title!,
        domain: (dialog.entity as any).username
      }));
  }

  async getPosts(source: Source): Promise<Post[]> {
    const messages = await this.#client.getMessages(Number(source.id), {
      limit: 100
    });

    return messages.map((message) => {
      const files: File[] = [];
      const { media } = message;

      if (media) {
        const attachments: File[] = match(media)
          .with(
            { className: "MessageMediaPhoto", photo: { className: "Photo" } },
            (data): File[] => [
              {
                id: data.photo.id.toString(),
                raw: message,
                type: FileType.IMAGE
              }
            ]
          )
          .with(
            {
              className: "MessageMediaDocument",
              document: { className: "Document" }
            },
            (data): File[] => [
              {
                id: data.document.id.toString(),
                raw: message,
                type:
                  (
                    {
                      image: FileType.IMAGE,
                      audio: FileType.AUDIO,
                      video: FileType.VIDEO,
                      text: FileType.DOCUMENT,
                      application: FileType.DOCUMENT
                    } as Record<string, FileType>
                  )[data.document.mimeType.split("/")[0]!] ??
                  FileType.UNSUPPORTED
              }
            ]
          )

          .otherwise(() => []);

        files.push(...attachments);
      }

      return {
        id: message.id,
        text: message.text,
        date: new Date(message.date * 1000),
        source,
        files
      };
    });
  }

  async getFileContents(file: File): Promise<Buffer> {
    const data = await this.#client.downloadMedia(file.raw as any);
    if (!data) {
      throw new Error("Unable to download file");
    }

    return Buffer.from(data);
  }

  async post(sourceId: string, content: PostContent): Promise<number> {
    const message = await this.#client.sendMessage(parseInt(sourceId), {
      message: content.text,
      file: content.files.map(
        (file) =>
          (file.raw as any).media.document ?? (file.raw as any).media.photo
      )
    });

    return message.id;
  }

  async uploadFile(type: FileType, contents: Buffer): Promise<File> {
    const realType = await fileTypeFromBuffer(contents);

    if (!realType) {
      throw new Error("Unable to detect file type");
    }

    const id = createHash("md5").update(contents).digest("hex");
    const fileName = `${id}.${realType.ext}`;

    const file = await this.#client.uploadFile({
      file: new CustomFile(fileName, contents.byteLength, fileName, contents),
      workers: 4
    });

    const message = await this.#client.sendMessage("me", { file });

    return {
      id: message.document?.id.toString() ?? message.photo?.id.toString()!,
      raw: message,
      type
    };
  }
}
