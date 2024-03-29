import { ConfigManager } from "config-manager";
import type { RouteHandler } from "~server/api/routes.type";
import type { APIRouteMeta } from "~types/api";

const config = await new ConfigManager({}).getConfig();

export const applyConfig = (routeMeta: APIRouteMeta) => {
	const newMeta = routeMeta;

	// Apply ratelimits from config
	newMeta.ratelimits.duration *= config.ratelimits.duration_coeff;
	newMeta.ratelimits.max *= config.ratelimits.max_coeff;

	// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
	if (config.custom_ratelimits[routeMeta.route]) {
		newMeta.ratelimits = config.custom_ratelimits[routeMeta.route];
	}

	return newMeta;
};

export const apiRoute = <T>(routeFunction: RouteHandler<T>) => {
	return routeFunction;
};
