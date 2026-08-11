import { expect } from "chai";
import wikidata from "../src/cita/wikidata";

describe("Wikidata - extractQIDsFromText", () => {
	it("should extract no QIDs from empty string", () => {
		expect(wikidata.extractQIDsFromText("")).to.deep.equal([]);
	});

	it("should extract no QIDs from whitespace input", () => {
		expect(wikidata.extractQIDsFromText(" \t\n\u00A0  ")).to.deep.equal([]);
	});

	it("should deduplicate identical QIDs (same prefix)", () => {
		expect(wikidata.extractQIDsFromText("Q1 Q1")).to.deep.equal([
			{ extra: "qid: Q1" },
		]);
	});

	it("should deduplicate normalized equivalent QIDs", () => {
		expect(wikidata.extractQIDsFromText("q1 1")).to.deep.equal([
			{ extra: "qid: Q1" },
		]);
	});

	it("should separate QIDs by tab/newline characters", () => {
		expect(wikidata.extractQIDsFromText("Q1\t\nQ2")).to.deep.equal([
			{ extra: "qid: Q1" },
			{ extra: "qid: Q2" },
		]);
	});

	it("should skip invalid tokens", () => {
		expect(wikidata.extractQIDsFromText("Q1 abc 789")).to.deep.equal([
			{ extra: "qid: Q1" },
			{ extra: "qid: Q789" },
		]);
	});

	it("should skip tokens with trailing letters", () => {
		expect(wikidata.extractQIDsFromText("Q1 456xyz")).to.deep.equal([
			{ extra: "qid: Q1" },
		]);
	});

	it("should reject unprefixed numbers in strict mode", () => {
		expect(wikidata.extractQIDsFromText("123", true)).to.deep.equal([]);
	});

	it("should skip non-prefixed tokens in strict mode with mixed input", () => {
		expect(
			wikidata.extractQIDsFromText("Q1 abc 456 Q34", true),
		).to.deep.equal([{ extra: "qid: Q1" }, { extra: "qid: Q34" }]);
	});

	it("should preserve insertion order of extracted QIDs", () => {
		expect(wikidata.extractQIDsFromText("Q5 Q3 Q7")).to.deep.equal([
			{ extra: "qid: Q5" },
			{ extra: "qid: Q3" },
			{ extra: "qid: Q7" },
		]);
	});

	it("should split valid QIDs on non-breaking space (\\u00A0)", () => {
		expect(wikidata.extractQIDsFromText("Q1\u00A0Q2")).to.deep.equal([
			{ extra: "qid: Q1" },
			{ extra: "qid: Q2" },
		]);
	});

	it("should ignore multiple consecutive whitespace separators", () => {
		expect(wikidata.extractQIDsFromText("Q1   \t\n  Q2")).to.deep.equal([
			{ extra: "qid: Q1" },
			{ extra: "qid: Q2" },
		]);
	});

	it("should extract prefixed QID after trimming surrounding whitespace", () => {
		expect(wikidata.extractQIDsFromText("  Q42  ")).to.deep.equal([
			{ extra: "qid: Q42" },
		]);
	});

	it("should return empty array when all tokens are invalid", () => {
		expect(wikidata.extractQIDsFromText("abc xyz 0 Q0")).to.deep.equal([]);
	});

	it("should normalize 'q' prefix and trim whitespace for prefixed input", () => {
		expect(wikidata.extractQIDsFromText(" q42 ")).to.deep.equal([
			{ extra: "qid: Q42" },
		]);
	});

	it("should extract all valid prefixed QIDs when every token is prefixed in strict mode", () => {
		expect(wikidata.extractQIDsFromText("Q1 Q2 Q3", true)).to.deep.equal([
			{ extra: "qid: Q1" },
			{ extra: "qid: Q2" },
			{ extra: "qid: Q3" },
		]);
	});
});
