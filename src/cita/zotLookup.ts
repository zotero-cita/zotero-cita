import Bottleneck from "bottleneck";
import OpenAlex from "openalex-sdk";
import { SearchParameters } from "openalex-sdk/dist/src/types/work";
import PID from "./PID";
import Wikicite from "./wikicite";
import _ from "lodash";
import { ParsableReference } from "./indexers/indexer";
import { WorkFilterParameters } from "openalex-sdk/dist/src/types/workFilterParameters";

interface TranslatedReference {
	/**
	 * The corresponding ParsableItems indexer-specific unique keys.
	 * @remarks We make the assumption that lookup is called with ParsableItems all coming from the same indexer, so that the primary key should provide a sufficient guarantee of a unique and exclusive set of PIDs.
	 */
	primaryID: string;
	item: ZoteroTranslators.Item;
}

export interface ParsedReference {
	/**
	 * The corresponding ParsableItem's indexer-specific unique keys.
	 * @remarks We make the assumption that lookup is called with ParsableItems all coming from the same indexer, so that the primary key should provide a sufficient guarantee of a unique and exclusive set of PIDs.
	 */
	primaryID: string;
	item: Zotero.Item;
}

export default class Lookup {
	static readonly pidsSupportedForLookup: PIDType[] = [
		"OpenAlex",
		"MAG",
		// DOI Content negotation probably provides the most reliable results, but is slow. We're not importing them into Zotero (yet), we're just getting the metadata as best as possible. Zotero will use DOI to fetch the item anyway on import.
		// TODO: maybe have a setting for "quality over quantity" once the fallback mechanism is in place?
		"DOI",
		"PMID",
		"PMCID",
		"arXiv",
		"ISBN",
	];

	// For import, we favour the regular identifiers
	static readonly pidsSupportedForImport: PIDType[] = [
		"DOI",
		"PMID",
		"PMCID",
		"arXiv",
		"ISBN",
		"OpenAlex",
		"MAG",
	];

	static async lookupIdentifiers(
		pids: PID[],
		libraryID: number | false = false,
		collections: number[] = [],
	): Promise<Zotero.Item[]> {
		const options: ZoteroTranslators.TranslateOptions = {
			libraryID,
			collections,
			saveAttachments: true,
		};

		const parsedItems: Zotero.Item[] = [];
		for (const pid of pids) {
			const item = await Lookup.translateIdentifier(pid, options);
			if (item[0] && item[0].key) {
				// Was added to Zotero, so it's already a Zotero.Item
				parsedItems.push(item[0] as unknown as Zotero.Item);
			} else {
				// Not added to Zotero, so we need to convert it
				parsedItems.push(Lookup.createZoteroItem(item[0]));
			}
		}

		if (parsedItems) {
			return parsedItems.map((parsedItem) => parsedItem);
		}

		return [];
	}

	/**
	 * Look up items by identifiers.
	 * @param parsableItemsWithIDs Array of ParsableReferences with external IDs.
	 * @param addToZotero Whether to add the found items to Zotero.
	 * @param failedIdentifiersFallback Callback for failed identifiers.
	 * @returns Array of ParsedReferences or false if none were found.
	 */
	static async lookupItems(
		parsableItemsWithIDs: ParsableReference<any>[],
		failedIdentifiersFallback?: (failedIDs: string[]) => void,
	): Promise<
		false | { parsedReferences: ParsedReference[]; duplicateCount: number }
	> {
		if (!parsableItemsWithIDs.length) {
			Zotero.logError(
				new Error(`Lookup input did not contain any items to look up.`),
			);
			return false;
		}

		// Initialize rate limiters for searching
		const limiter = new Bottleneck({
			maxConcurrent: 5,
			minTime: 200, // Adjust as needed based on API rate limits
		});
		const openAlexLimiter = new Bottleneck({
			maxConcurrent: 5,
			minTime: 120, // A little less than 10 requests per second
		});

		const options: ZoteroTranslators.TranslateOptions = {
			libraryID: false,
			collections: [],
			saveAttachments: false,
		};

		const translatedReferences: TranslatedReference[] = [];

		let remainingItemsToLookup = parsableItemsWithIDs;

		// lookup identifiers in order of preference (fastest first)
		// if lookup fails and the item has other other valid identifiers, try those too
		for (const pidType of Lookup.pidsSupportedForLookup) {
			if (remainingItemsToLookup.length == 0) {
				break;
			}
			const referencesWithPidType = remainingItemsToLookup
				.filter((reference) =>
					reference.externalIds
						.map((pid) => pid.type)
						.includes(pidType),
				)
				.map((reference) => ({
					primaryID: reference.primaryID,
					pid: reference.externalIds.filter(
						(pid) => pid.type == pidType,
					)[0],
				}));
			if (referencesWithPidType.length == 0) {
				continue;
			}

			let results: { translated: TranslatedReference[]; failed: PID[] };
			if (
				["OpenAlex", "MAG", "DOI", "PMID", "PMCID", "arXiv"].includes(
					pidType,
				)
			) {
				results = await Lookup.processBatchIdentifiers(
					pidType,
					90,
					referencesWithPidType,
					options,
					openAlexLimiter,
					Lookup.fetchOpenAlexBatch,
				);
			} else {
				// Regular processing for other types
				results = await Lookup.processStandardIdentifiers(
					pidType,
					referencesWithPidType,
					options,
					limiter,
				);
			}

			// remove items to be looked up if we already found them
			const successfullyLookedUpIds = results.translated.map(
				(reference) => reference.primaryID,
			);
			remainingItemsToLookup = remainingItemsToLookup.filter(
				(reference) =>
					!successfullyLookedUpIds.includes(reference.primaryID),
			);
			translatedReferences.push(...results.translated);
		}

		const parsedReferences = translatedReferences.map((reference) => ({
			primaryID: reference.primaryID,
			item: Lookup.createZoteroItem(reference.item),
		}));
		if (!parsedReferences.length) {
			Zotero.alert(
				window,
				Zotero.getString("lookup.failure.title"),
				Zotero.getString("lookup.failure.description"),
			);
			return false;
		}

		// Handle failed identifiers
		const failedIdentifiers = remainingItemsToLookup.map(
			(reference) => reference.primaryID,
		);
		if (failedIdentifiers.length && failedIdentifiersFallback) {
			failedIdentifiersFallback(failedIdentifiers);
		}

		return { parsedReferences, duplicateCount: 0 };
	}

	/**
	 * Extracts the best identifiers from ParsableReferences.
	 */
	private static getBestIdentifiers(
		parsableItems: ParsableReference<any>[],
	): { primaryID: string; pid: PID }[] {
		const bestIdentifiers: { primaryID: string; pid: PID }[] = [];

		for (const item of parsableItems) {
			// Map external IDs by type
			const pidMap = new Map(
				item.externalIds.map((pid) => [pid.type, pid]),
			);

			// Select the best (valid) PID based on priority
			for (const type of Lookup.pidsSupportedForLookup) {
				const pid = pidMap.get(type);
				if (pid?.cleanID) {
					bestIdentifiers.push({ primaryID: item.primaryID, pid });
					break;
				}
			}
		}

		return bestIdentifiers;
	}

	/**
	 * Processes identifiers using standard translators (DOI, PMID, etc.).
	 */
	private static async processStandardIdentifiers(
		type: PIDType,
		entries: { primaryID: string; pid: PID }[],
		options: ZoteroTranslators.TranslateOptions,
		limiter: Bottleneck,
	): Promise<{ translated: TranslatedReference[]; failed: PID[] }> {
		const translatedReferences: TranslatedReference[] = [];
		const failedPIDs: PID[] = [];

		// Batch identifiers if possibles
		const identifiers = entries.map((entry) => entry.pid.cleanID!);

		// We the matching translators once and then use them for all PIDs, since they're guaranteed to be of the same type
		const dummyTranslator =
			new Zotero.Translate.Search() as ZoteroTranslators.Translate<ZoteroTranslators.SearchTranslator>;
		const firstPID = entries[0].pid;
		const searchObject = { [firstPID.type]: firstPID.id };
		dummyTranslator.setSearch(searchObject as any);
		const searchTranslators = await dummyTranslator.getTranslators(); // Always returns all possible translators, regardless of arguments

		// TODO: consider fecthing the translators parsing method's directly and call the API ourselves (such as Crossref's API)
		// Assuming the translators support batch processing (if not, process individually)
		// Here, we assume batch processing is not supported, so we process individually
		await Promise.all(
			entries.map(async (entry) => {
				performance.mark("start-translation-pid-" + entry.pid.id);
				try {
					const items = await limiter.schedule(() =>
						Lookup.translateIdentifier(entry.pid, options),
					);
					performance.mark("start-translation-pid-" + entry.pid.id);
					if (items.length) {
						translatedReferences.push({
							primaryID: entry.primaryID,
							item: items[0],
						});
					} else {
						failedPIDs.push(entry.pid);
					}
				} catch (error) {
					failedPIDs.push(entry.pid);
					Zotero.logError(
						new Error(
							`Failed to translate ${entry.pid.type}:${entry.pid.id} - ${error}`,
						),
					);
				}
				performance.mark("end-translation-pid-" + entry.pid.id);
				performance.measure(
					"translation-pid-" + entry.pid.id,
					"start-translation-pid-" + entry.pid.id,
					"end-translation-pid-" + entry.pid.id,
				);
			}),
		);

		return { translated: translatedReferences, failed: failedPIDs };
	}

	/**
	 * Processes identifiers in batches.
	 */
	private static async processBatchIdentifiers(
		type: PIDType,
		batchSize: number,
		entries: { primaryID: string; pid: PID }[],
		options: ZoteroTranslators.TranslateOptions,
		limiter: Bottleneck,
		batchFetcher: (
			type: PIDType,
			entries: { primaryID: string; pid: PID }[],
			options: ZoteroTranslators.TranslateOptions,
			batchID: number,
		) => Promise<{ translated: TranslatedReference[]; failed: PID[] }>,
	): Promise<{ translated: TranslatedReference[]; failed: PID[] }> {
		const translatedReferences: TranslatedReference[] = [];
		const failedPIDs: PID[] = [];

		const batches = _.chunk(entries, batchSize);

		// Process all batches in parallel
		const batchPromises = batches.map(async (batch, index) => {
			try {
				const { translated: items, failed } = await limiter.schedule(
					() => batchFetcher(type, batch, options, index),
				);
				translatedReferences.push(...items);
				failedPIDs.push(...failed);
			} catch (error) {
				// If the entire batch fails, consider all entries as failed
				failedPIDs.push(...batch.map((entry) => entry.pid));
				Zotero.logError(
					new Error(`Failed to process batch - ${error}`),
				);
			}
		});

		// Wait for all batch promises to resolve
		await Promise.all(batchPromises);

		return { translated: translatedReferences, failed: failedPIDs };
	}

	/**
	 * Translates a single identifier using the appropriate translator.
	 */
	private static async translateIdentifier(
		pid: PID,
		options: ZoteroTranslators.TranslateOptions,
	): Promise<ZoteroTranslators.Item[]> {
		const translator =
			new Zotero.Translate.Search() as ZoteroTranslators.Translate<ZoteroTranslators.SearchTranslator>;
		translator.setSearch({ [pid.type]: pid.id } as any);
		const translators = await translator.getTranslators();

		if (!translators.length) {
			throw new Error(`No translators found for ${pid.type}`);
		}

		translator.setTranslator(translators);

		return translator.translate(options);
	}

	/**
	 * Fetches a batch of works on OpenAlex by identifier.
	 * Supports DOI, PMID, PMCID, OpenAlex, MAG.
	 */
	private static async fetchCrossrefBatch(
		type: PIDType,
		entries: { primaryID: string; pid: PID }[],
		options: ZoteroTranslators.TranslateOptions,
	): Promise<TranslatedReference[]> {
		const filter = entries
			.map((entry) => `${type.toLowerCase()}:${entry.pid.id}`)
			.join(",");

		const url = `https://api.crossref.org/works?filter=${filter}&rows=${entries.length}`;

		const requestOptions = {
			headers: {
				"User-Agent": `${Wikicite.getUserAgent()} mailto:cita@duck.com`,
			},
			responseType: "json",
		};

		const response = await Zotero.HTTP.request(
			"GET",
			url,
			requestOptions,
		).catch((e) => {
			Zotero.logError(
				new Error(
					`Couldn't access URL: ${url}. Got status ${e.status}.`,
				),
			);
		});

		if (!response || !response.response) {
			throw new Error(`No response from ${url}`);
		}

		const translator =
			new Zotero.Translate.Import() as ZoteroTranslators.Translate<ZoteroTranslators.ImportTranslator>;
		translator.setTranslator("0a61e167-de9a-4f93-a68a-628b48855909"); // CrossRef REST
		translator.setString(JSON.stringify(response.response));
		// translator.setHandler("debug", (obj, text) => {
		//     Zotero.log(`[CrossRef] ${text}`);
		//     return true;
		// });

		const items = await translator.translate(options);

		// Map items back to primary IDs
		const translatedReferences: TranslatedReference[] = [];

		for (const item of items) {
			const pidValue = Lookup.getIdentifierFromItem(item, type);
			const matchingEntry = entries.find(
				(entry) =>
					entry.pid.id.toLowerCase() === pidValue?.toLowerCase(),
			);
			if (matchingEntry) {
				translatedReferences.push({
					primaryID: matchingEntry.primaryID,
					item,
				});
			} else {
				Zotero.logError(
					new Error(
						`Failed to match item ${item.title} to primary ID. Expected DOI: ${pidValue}`,
					),
				);
			}
		}

		return translatedReferences;
	}

	/**
	 * Fetches a batch of works on OpenAlex by identifier.
	 * Supports DOI, PMID, PMCID, OpenAlex, MAG.
	 */
	private static async fetchOpenAlexBatch(
		type: PIDType,
		entries: { primaryID: string; pid: PID }[],
		options: ZoteroTranslators.TranslateOptions,
		batchID: number,
	): Promise<{ translated: TranslatedReference[]; failed: PID[] }> {
		const translatedReferences: TranslatedReference[] = [];
		const failedPIDs: PID[] = [];

		try {
			// Build the request parameters
			performance.mark(`start-openalex-batch-${type}-${batchID}-fetch`);
			let filter: WorkFilterParameters;
			switch (type) {
				case "DOI":
					filter = { doi: entries.map((entry) => entry.pid.id) };
					break;
				case "arXiv":
					filter = {
						doi: entries.map((entry) =>
							Lookup.arXivToDOI(entry.pid.id),
						),
					};
					break;
				default: {
					const ids = entries.map((entry) => ({
						[type.toLowerCase()]: entry.pid.id,
					}));
					filter = { ids };
					break;
				}
			}

			const params: SearchParameters = {
				filter: filter,
				retriveAllPages: true,
			};

			// Fetch works from OpenAlex
			const sdk = new OpenAlex("cita@duck.com");
			const works = await sdk.works(params);
			performance.mark(`end-openalex-batch-${type}-${batchID}-fetch`);
			performance.measure(
				`openalex-batch-${type}-${batchID}-fetch`,
				`start-openalex-batch-${type}-${batchID}-fetch`,
				`end-openalex-batch-${type}-${batchID}-fetch`,
			);

			// Convert the works to Zotero items
			performance.mark(
				`start-openalex-batch-${type}-${batchID}-translate`,
			);
			const apiJSON = JSON.stringify(works);
			const translator = new Zotero.Translate.Import();
			translator.setTranslator("faa53754-fb55-4658-9094-ae8a7e0409a2"); // OpenAlex JSON
			translator.setString(apiJSON);

			const items = await translator.translate(options);
			performance.mark(`end-openalex-batch-${type}-${batchID}-translate`);
			performance.measure(
				`openalex-batch-${type}-${batchID}-translate`,
				`start-openalex-batch-${type}-${batchID}-translate`,
				`end-openalex-batch-${type}-${batchID}-translate`,
			);

			// Map items back to primary IDs
			performance.mark(`start-openalex-batch-${type}-${batchID}-map`);
			for (const item of items) {
				// FIXME: this is hacky
				let pidValue = Lookup.getIdentifierFromItem(
					item,
					type === "MAG" ? "OpenAlex" : type,
				);
				if (type === "MAG") {
					// We pop the leading W of the OpenAlex ID hoping that this is a valid MAG ID
					pidValue = pidValue?.substring(1);
				}
				const matchingEntry = entries.find(
					(entry) =>
						entry.pid.cleanID?.toLowerCase() ===
						pidValue?.toLowerCase(),
				);
				if (matchingEntry) {
					translatedReferences.push({
						primaryID: matchingEntry.primaryID,
						item,
					});
				}
			}

			// Collect failed PIDs
			for (const entry of entries) {
				if (
					!translatedReferences.find(
						(ref) => ref.primaryID === entry.primaryID,
					)
				) {
					failedPIDs.push(entry.pid);
				}
			}
			performance.mark(`end-openalex-batch-${type}-${batchID}-map`);
			performance.measure(
				`openalex-batch-${type}-${batchID}-map`,
				`start-openalex-batch-${type}-${batchID}-map`,
				`end-openalex-batch-${type}-${batchID}-map`,
			);
		} catch (error) {
			// If the batch request fails, consider all entries as failed
			failedPIDs.push(...entries.map((entry) => entry.pid));
			Zotero.logError(
				new Error(`Failed to fetch OpenAlex batch - ${error}`),
			);
		}

		return { translated: translatedReferences, failed: failedPIDs };
	}

	private static getIdentifierFromItem(
		item: ZoteroTranslators.Item,
		type: PIDType,
	): string | undefined {
		switch (type) {
			case "DOI":
				return item.DOI || item.extra?.match(/DOI:\s*(\S+)/)?.[1];
			case "PMID":
				return item.PMID;
			case "PMCID":
				return item.PMCID;
			case "OpenAlex":
				return item.extra?.match(/OpenAlex:\s*(\S+)/)?.[1];
			case "MAG":
				return item.extra?.match(/MAG:\s*(\S+)/)?.[1];
			case "arXiv":
				// on OpenAlex the arXiv ID is stored as a DOI
				return (
					item.extra?.match(/arXiv:\s*(\S+)/)?.[1] ||
					this.DOIToArXiv(
						item.DOI || item.extra?.match(/DOI:\s*(\S+)/)?.[1],
					)
				);
			case "ISBN":
				return item.ISBN;
			default:
				return "";
		}
	}

	/**
	 * Creates a Zotero.Item from a ZoteroTranslators.Item.
	 */
	private static createZoteroItem(
		translatorItem: ZoteroTranslators.Item,
		addToZotero: boolean = false,
	): Zotero.Item {
		if (!addToZotero) {
			// delete irrelevant fields to avoid warnings in Item#fromJSON
			delete translatorItem.notes;
			delete translatorItem.seeAlso;
			delete translatorItem.attachments;
		}
		const newItem = new Zotero.Item(translatorItem.itemType);
		newItem.fromJSON(translatorItem);
		return newItem;
	}

	private static arXivToDOI(arXivID: string) {
		return "10.48550/arXiv." + arXivID;
	}
	private static DOIToArXiv(DOI?: string) {
		return DOI?.toLowerCase().replace("10.48550/arxiv.", "");
	}
}
