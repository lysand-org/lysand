/**
 * @file index.ts
 * @summary ConfigManager system to retrieve and modify system configuration
 * @description Can read from a hand-written file, config.toml, or from a machine-saved file, config.internal.toml
 * Fuses both and provides a way to retrieve individual values
 */

import { parse, stringify, type JsonMap } from "@iarna/toml";
import type { ConfigType } from "./config-type.type";
import { configDefaults } from "./config-type.type";
import merge from "merge-deep-ts";

export class ConfigManager {
	constructor(
		public config: {
			configPathOverride?: string;
			internalConfigPathOverride?: string;
		}
	) {}

	/**
	 * @summary Reads the config files and returns the merge as a JSON object
	 * @returns {Promise<T = ConfigType>} The merged config file as a JSON object
	 */
	async getConfig<T = ConfigType>() {
		const config = await this.readConfig<T>();
		const internalConfig = await this.readInternalConfig<T>();

		return this.mergeConfigs<T>(
			configDefaults as T,
			config,
			internalConfig
		);
	}

	getConfigPath() {
		return (
			this.config.configPathOverride ||
			process.cwd() + "/config/config.toml"
		);
	}

	getInternalConfigPath() {
		return (
			this.config.internalConfigPathOverride ||
			process.cwd() + "/config/config.internal.toml"
		);
	}

	/**
	 * @summary Reads the internal config file and returns it as a JSON object
	 * @returns {Promise<T = ConfigType>} The internal config file as a JSON object
	 */
	private async readInternalConfig<T = ConfigType>() {
		const config = Bun.file(this.getInternalConfigPath());

		if (!(await config.exists())) {
			await Bun.write(config, "");
		}

		return this.parseConfig<T>(await config.text());
	}

	/**
	 * @summary Reads the config file and returns it as a JSON object
	 * @returns {Promise<T = ConfigType>} The config file as a JSON object
	 */
	private async readConfig<T = ConfigType>() {
		const config = Bun.file(this.getConfigPath());

		if (!(await config.exists())) {
			throw new Error(
				`Error while reading config at path ${this.getConfigPath()}: Config file not found`
			);
		}

		return this.parseConfig<T>(await config.text());
	}

	/**
	 * @summary Parses a TOML string and returns it as a JSON object
	 * @param text The TOML string to parse
	 * @returns {T = ConfigType} The parsed TOML string as a JSON object
	 * @throws {Error} If the TOML string is invalid
	 * @private
	 */
	private parseConfig<T = ConfigType>(text: string) {
		try {
			// To all [Symbol] keys from the object
			return JSON.parse(JSON.stringify(parse(text))) as T;
		} catch (e: any) {
			throw new Error(
				`Error while parsing config at path ${this.getConfigPath()}: ${e}`
			);
		}
	}

	/**
	 * Writes changed values to the internal config
	 * @param config The new config object
	 */
	async writeConfig<T = ConfigType>(config: T) {
		const path = this.getInternalConfigPath();
		const file = Bun.file(path);

		await Bun.write(
			file,
			`# THIS FILE IS AUTOMATICALLY GENERATED. DO NOT EDIT IT MANUALLY, EDIT THE STANDARD CONFIG.TOML INSTEAD.\n${stringify(
				config as JsonMap
			)}`
		);
	}

	/**
	 * @summary Merges two config objects together, with
	 * the latter configs' values taking precedence
	 * @param configs
	 * @returns
	 */
	private mergeConfigs<T = ConfigType>(...configs: T[]) {
		return merge(configs) as T;
	}
}

export type { ConfigType };
export const defaultConfig = configDefaults;
