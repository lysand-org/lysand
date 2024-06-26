import { z } from "zod";
import { Hooks } from "./hooks";
import { Plugin, PluginConfigManager } from "./plugin";
import type { Manifest } from "./schema";

const myManifest: Manifest = {
    name: "my-plugin",
    description: "A plugin for my app",
    version: "1.0.0",
};

const configManager = new PluginConfigManager(
    z.object({
        apiKey: z.string(),
    }),
);

const myPlugin = new Plugin(myManifest, configManager);

myPlugin.registerHandler(Hooks.Response, (req) => {
    console.info("Request received:", req);
    return req;
});
