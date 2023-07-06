import { Solver } from "2captcha";
import { env } from "./env.js";

export const solver = new Solver(env("RUCAPTCHA_KEY"));
