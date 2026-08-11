import { expect } from "chai";
import PID from "../src/cita/PID";

describe("PID - cleanQID", () => {
	it("should normalize lowercase 'q' to uppercase in non-strict mode", () => {
		expect(PID.cleanQID("q789")).to.equal("Q789");
	});

	it("should auto-prefix unprefixed number (non-strict)", () => {
		expect(PID.cleanQID("123")).to.equal("Q123");
	});

	it("should trim surrounding whitespace before auto-prefixing", () => {
		expect(PID.cleanQID(" 456 ")).to.equal("Q456");
	});

	it("should treat leading zeros as invalid (e.g. '01') in non-strict mode", () => {
		expect(PID.cleanQID("01")).to.equal(null);
	});

	it("should handle single-digit QID", () => {
		expect(PID.cleanQID("Q1")).to.equal("Q1");
	});

	it("should handle large numeric QID", () => {
		expect(PID.cleanQID("Q999999")).to.equal("Q999999");
	});

	it("should return an empty string for an empty string", () => {
		expect(PID.cleanQID("")).to.equal(null);
	});

	it("should reject non QID inputs", () => {
		expect(PID.cleanQID("asdf")).to.equal(null);
	});

	it("should reject '0' as unprefixed in non-strict mode (auto-prefixes to invalid Q0)", () => {
		expect(PID.cleanQID("0")).to.equal(null);
	});

	it("should reject 'Q1a' (trailing letter)", () => {
		expect(PID.cleanQID("Q1a")).to.equal(null);
	});

	it("should reject 'Q' alone (no digits)", () => {
		expect(PID.cleanQID("Q")).to.equal(null);
	});

	it("should reject 'Q0' (not valid)", () => {
		expect(PID.cleanQID("Q0")).to.equal(null);
	});

	it("should reject 'Qabc' (letters after Q)", () => {
		expect(PID.cleanQID("Qabc")).to.equal(null);
	});

	it("should reject QID with leading zeros", () => {
		expect(PID.cleanQID("Q01")).to.equal(null);
	});

	it("should reject 'QQ123' (extra characters)", () => {
		expect(PID.cleanQID("QQ123")).to.equal(null);
	});
});
