/**
 * RequestParser
 * @file index.ts
 * @module request-parser
 * @description Parses Request object into a JavaScript object based on the content type
 */

/**
 * RequestParser
 * Parses Request object into a JavaScript object
 * based on the Content-Type header
 * @param request Request object
 * @returns JavaScript object of type T
 */
export class RequestParser {
	constructor(public request: Request) {}

	/**
	 * Parse request body into a JavaScript object
	 * @returns JavaScript object of type T
	 * @throws Error if body is invalid
	 */
	async toObject<T>() {
		try {
			switch (await this.determineContentType()) {
				case "application/json":
					return this.parseJson<T>();
				case "application/x-www-form-urlencoded":
					return this.parseFormUrlencoded<T>();
				case "multipart/form-data":
					return this.parseFormData<T>();
				default:
					return this.parseQuery<T>();
			}
		} catch {
			return {} as T;
		}
	}

	/**
	 * Determine body content type
	 * If there is no Content-Type header, automatically
	 * guess content type. Cuts off after ";" character
	 * @returns Content-Type header value, or empty string if there is no body
	 * @throws Error if body is invalid
	 * @private
	 */
	private async determineContentType() {
		if (this.request.headers.get("Content-Type")) {
			return (
				this.request.headers.get("Content-Type")?.split(";")[0] ?? ""
			);
		}

		// Check if body is valid JSON
		try {
			await this.request.json();
			return "application/json";
		} catch {
			// This is not JSON
		}

		// Check if body is valid FormData
		try {
			await this.request.formData();
			return "multipart/form-data";
		} catch {
			// This is not FormData
		}

		if (this.request.body) {
			throw new Error("Invalid body");
		}

		// If there is no body, return query parameters
		return "";
	}

	/**
	 * Parse FormData body into a JavaScript object
	 * @returns JavaScript object of type T
	 * @private
	 * @throws Error if body is invalid
	 */
	private async parseFormData<T>(): Promise<Partial<T>> {
		const formData = await this.request.formData();
		const result: Partial<T> = {};

		for (const [key, value] of formData.entries()) {
			if (value instanceof File) {
				result[key as keyof T] = value as any;
			} else if (key.endsWith("[]")) {
				const arrayKey = key.slice(0, -2) as keyof T;
				if (!result[arrayKey]) {
					result[arrayKey] = [] as T[keyof T];
				}

				(result[arrayKey] as any[]).push(value);
			} else {
				result[key as keyof T] = value as any;
			}
		}

		return result;
	}

	/**
	 * Parse application/x-www-form-urlencoded body into a JavaScript object
	 * @returns JavaScript object of type T
	 * @private
	 * @throws Error if body is invalid
	 */
	private async parseFormUrlencoded<T>(): Promise<Partial<T>> {
		const formData = await this.request.formData();
		const result: Partial<T> = {};

		for (const [key, value] of formData.entries()) {
			if (key.endsWith("[]")) {
				const arrayKey = key.slice(0, -2) as keyof T;
				if (!result[arrayKey]) {
					result[arrayKey] = [] as T[keyof T];
				}

				(result[arrayKey] as any[]).push(value);
			} else {
				result[key as keyof T] = value as any;
			}
		}

		return result;
	}

	/**
	 * Parse JSON body into a JavaScript object
	 * @returns JavaScript object of type T
	 * @private
	 * @throws Error if body is invalid
	 */
	private async parseJson<T>(): Promise<Partial<T>> {
		try {
			return (await this.request.json()) as T;
		} catch {
			return {};
		}
	}

	/**
	 * Parse query parameters into a JavaScript object
	 * @private
	 * @throws Error if body is invalid
	 * @returns JavaScript object of type T
	 */
	private parseQuery<T>(): Partial<T> {
		const result: Partial<T> = {};
		const url = new URL(this.request.url);

		for (const [key, value] of url.searchParams.entries()) {
			if (key.endsWith("[]")) {
				const arrayKey = key.slice(0, -2) as keyof T;
				if (!result[arrayKey]) {
					result[arrayKey] = [] as T[keyof T];
				}
				(result[arrayKey] as string[]).push(value);
			} else {
				result[key as keyof T] = value as any;
			}
		}
		return result;
	}
}
