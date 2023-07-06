import { Platform, Post, Source } from "./platform.js";

export class Dispatcher<A extends Platform, B extends Platform> {
  constructor(public readonly from: A, public readonly to: B) {}

  async authenticate() {
    await Promise.all([this.from.authenticate(), this.to.authenticate()]);
  }

  async getSources() {
    return await this.from.getSources();
  }

  async getPosts(source: Source) {
    return await this.from.getPosts(source);
  }

  async getDestinations() {
    return await this.to.getDestinations();
  }

  async copyPost(post: Post, destination: Source) {
    return await this.to.post(destination.id, {
      text: post.text,
      files: await Promise.all(
        post.files.map(async (file) => {
          const buffer = await this.from.getFileContents(file);
          return await this.to.uploadFile(file.type, buffer);
        })
      )
    });
  }

  swap(): Dispatcher<B, A> {
    return new Dispatcher(this.to, this.from);
  }
}
