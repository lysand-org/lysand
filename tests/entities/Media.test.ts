import { type ConfigType, getConfig } from "@config";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { LocalBackend, S3Backend } from "~classes/media";
import { unlink } from "fs/promises";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";

const originalConfig = getConfig();
const modifiedConfig: ConfigType = {
	...originalConfig,
	media: {
		...originalConfig.media,
		conversion: {
			...originalConfig.media.conversion,
			convert_images: false,
		},
	},
};

describe("LocalBackend", () => {
	let localBackend: LocalBackend;
	let fileName: string;

	beforeAll(() => {
		localBackend = new LocalBackend(modifiedConfig);
	});

	afterAll(async () => {
		await unlink(`${process.cwd()}/uploads/${fileName}`);
	});

	describe("addMedia", () => {
		it("should write the file to the local filesystem and return the hash", async () => {
			const media = new File(["test"], "test.txt", {
				type: "text/plain",
			});

			const hash = await localBackend.addMedia(media);
			fileName = hash;

			expect(hash).toBeDefined();
		});
	});

	describe("getMediaByHash", () => {
		it("should retrieve the file from the local filesystem and return it as a File object", async () => {
			const media = await localBackend.getMediaByHash(fileName);

			expect(media).toBeInstanceOf(File);
		});

		it("should return null if the file does not exist", async () => {
			const media =
				await localBackend.getMediaByHash("does-not-exist.txt");

			expect(media).toBeNull();
		});
	});
});

describe("S3Backend", () => {
	const s3Backend = new S3Backend(modifiedConfig);
	let fileName: string;

	afterAll(async () => {
		const command = new DeleteObjectCommand({
			Bucket: modifiedConfig.s3.bucket_name,
			Key: fileName,
		});

		await s3Backend.client.send(command);
	});

	describe("addMedia", () => {
		it("should write the file to the S3 bucket and return the hash", async () => {
			const media = new File(["test"], "test.txt", {
				type: "text/plain",
			});

			const hash = await s3Backend.addMedia(media);
			fileName = hash;

			expect(hash).toBeDefined();
		});
	});

	describe("getMediaByHash", () => {
		it("should retrieve the file from the S3 bucket and return it as a File object", async () => {
			const media = await s3Backend.getMediaByHash(fileName);

			expect(media).toBeInstanceOf(File);
		});

		it("should return null if the file does not exist", async () => {
			const media = await s3Backend.getMediaByHash("does-not-exist.txt");

			expect(media).toBeNull();
		});
	});
});
