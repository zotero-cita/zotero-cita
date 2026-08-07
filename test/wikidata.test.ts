import { assert, expect } from "chai";
import wikidata from "../src/cita/wikidata";

describe("Wikidata - QID parsing", () => {
	it("should extract no QIDs", () => {
		expect(wikidata.extractQIDsFromText("  abc  ")).to.deep.equal([]);
	});

	it("should extract QIDs despite whitespace", () => {
		expect(wikidata.extractQIDsFromText("  Q123  ")).to.deep.equal([
			{ extra: "qid: Q123" },
		]);
	});

	it("should extract multiple QIDs", () => {
		expect(wikidata.extractQIDsFromText("  Q1    Q2  ")).to.deep.equal([
			{ extra: "qid: Q1" },
			{ extra: "qid: Q2" },
		]);
	});
});
