import { assert, expect } from "chai";
import SourceItemWrapper from "../src/cita/sourceItemWrapper";
import { Citation } from "../src/cita/citation";

describe("SourceItemWrapper - addCitations", () => {
	it("should add zero citations to an item", () => {
		const item = new SourceItemWrapper(
			new Zotero.Item("journalArticle"),
			"note",
		);
		item.addCitations([]);
		expect(item.citations.length).to.equal(0);
	});

	it("should add one citation to an item then get it", () => {
		const item = new SourceItemWrapper(
			new Zotero.Item("journalArticle"),
			"note",
		);
		item.title = "item1";
		item.addCitations(
			new Citation(
				{ item: { itemType: "journalArticle" } },
				item,
				"create",
			),
		);
		expect(item.citations.length).to.equal(1);
		expect(item.citations[0].source.title).to.equal("item1");
	});

	it("should add two citations to an item then get them", () => {
		const item = new SourceItemWrapper(
			new Zotero.Item("journalArticle"),
			"note",
		);
		item.title = "item1";
		item.addCitations([
			new Citation({ item: { itemType: "report" } }, item, "create"),
			new Citation({ item: { itemType: "book" } }, item, "create"),
		]);
		expect(item.citations.length).to.equal(2);
		expect(item.citations[0].source.title).to.equal("item1");
		expect(item.citations[0].target.item.itemType).to.equal("report");
		expect(item.citations[1].target.item.itemType).to.equal("book");
	});
});
