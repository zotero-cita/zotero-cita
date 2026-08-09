import { assert, expect } from "chai";
import wikidata from "../src/cita/wikidata";

describe("Wikidata - cleanQID", () => {
	it("should normalize lowercase 'q' to uppercase in non-strict mode", () => {
		expect(wikidata.cleanQID("q789")).to.equal("Q789");
	});

	it("should auto-prefix unprefixed number (non-strict)", () => {
		expect(wikidata.cleanQID("123")).to.equal("Q123");
	});

	it("should trim surrounding whitespace before auto-prefixing", () => {
		expect(wikidata.cleanQID(" 456 ")).to.equal("Q456");
	});

	it("should treat leading zeros as invalid (e.g. '01') in non-strict mode", () => {
		expect(wikidata.cleanQID("01")).to.equal("");
	});

	it("should handle single-digit QID", () => {
		expect(wikidata.cleanQID("Q1")).to.equal("Q1");
	});

	it("should handle large numeric QID", () => {
		expect(wikidata.cleanQID("Q999999")).to.equal("Q999999");
	});

	it("should return an empty string for an empty string", () => {
		expect(wikidata.cleanQID("")).to.equal("");
	});

	it("should reject non QID inputs", () => {
		expect(wikidata.cleanQID("asdf")).to.equal("");
	});

	it("should reject '0' as unprefixed in non-strict mode (auto-prefixes to invalid Q0)", () => {
		expect(wikidata.cleanQID("0")).to.equal("");
	});

	it("should reject 'Q1a' (trailing letter)", () => {
		expect(wikidata.cleanQID("Q1a")).to.equal("");
	});

	it("should reject 'Q' alone (no digits)", () => {
		expect(wikidata.cleanQID("Q")).to.equal("");
	});

	it("should reject 'Q0' (not valid)", () => {
		expect(wikidata.cleanQID("Q0")).to.equal("");
	});

	it("should reject 'Qabc' (letters after Q)", () => {
		expect(wikidata.cleanQID("Qabc")).to.equal("");
	});

	it("should reject QID with leading zeros", () => {
		expect(wikidata.cleanQID("Q01")).to.equal("");
	});

	it("should reject 'QQ123' (extra characters)", () => {
		expect(wikidata.cleanQID("QQ123")).to.equal("");
	});
});

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
