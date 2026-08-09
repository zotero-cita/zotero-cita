import { assert } from "chai";
import { config } from "../package.json";

describe("startup", function () {
	it("should have plugin instance defined", function () {
		// @ts-expect-error - Plugin instance is not typed
		assert.isNotEmpty(Zotero[config.addonInstance]);
	});
});
