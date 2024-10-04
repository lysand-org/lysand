import { encode } from "blurhash";
import sharp from "sharp";
import type { MediaPreprocessor } from "./media-preprocessor.ts";

export class BlurhashPreprocessor implements MediaPreprocessor {
    public async process(
        file: File,
    ): Promise<{ file: File; blurhash: string | null }> {
        try {
            const arrayBuffer = await file.arrayBuffer();
            const metadata = await sharp(arrayBuffer).metadata();

            const blurhash = await new Promise<string | null>((resolve) => {
                sharp(arrayBuffer)
                    .raw()
                    .ensureAlpha()
                    .toBuffer((err, buffer) => {
                        if (err) {
                            resolve(null);
                            return;
                        }

                        try {
                            resolve(
                                encode(
                                    new Uint8ClampedArray(buffer),
                                    metadata?.width ?? 0,
                                    metadata?.height ?? 0,
                                    4,
                                    4,
                                ) as string,
                            );
                        } catch {
                            resolve(null);
                        }
                    });
            });

            return { file, blurhash };
        } catch {
            return { file, blurhash: null };
        }
    }
}
