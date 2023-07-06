// Required env variables
// - TELEGRAM_API_ID
// - TELEGRAM_API_HASH
// - RUCAPTCHA_KEY

import "dotenv/config";
import { TelegramPlatform } from "./telegram.platform.js";
import { save, init } from "./cache.js";
import { VkPlatform } from "./vk.platform.js";
import { Dispatcher } from "./dispatcher.js";

await init();
const tg = new TelegramPlatform();
const vk = new VkPlatform();
const dispatcher = new Dispatcher(vk, tg);
await dispatcher.authenticate();

await save();

console.log("Getting sources");
const sources = await dispatcher.getSources();
const source = sources.find((s) => s.domain === "justputin2024")!;
const posts = await dispatcher.getPosts(source);
const post = posts[Math.floor(Math.random() * posts.length)]!;

console.log("Posting", post);
await dispatcher.copyPost(post, { id: "777799947", title: "Мшк Фрде" });
