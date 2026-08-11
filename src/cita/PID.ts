export default class PID {
	type: PIDType;
	id: string;

	constructor(type: PIDType, id: string) {
		this.type = type;
		this.id = id;
	}

	get url(): string | null {
		const cleanPID = this.cleanID;
		if (cleanPID) {
			switch (this.type) {
				case "DOI": {
					const url =
						"https://doi.org/" +
						// From Zotero's itembox.xml:
						// Encode some characters that are technically valid in DOIs,
						// though generally not used. '/' doesn't need to be encoded.
						cleanPID
							.replace(/#/g, "%23")
							.replace(/\?/g, "%3f")
							.replace(/%/g, "%25")
							.replace(/"/g, "%22");
					return url;
				}
				case "OMID":
					return "https://opencitations.net/meta/" + cleanPID;
				case "OpenAlex":
					return "https://openalex.org/works/" + cleanPID;
				case "arXiv":
					return "https://arxiv.org/abs/" + cleanPID;
				case "QID":
					return "https://wikidata.org/wiki/" + cleanPID;
				case "CorpusID":
					return (
						"https://api.semanticscholar.org/CorpusID:" + cleanPID
					);
				case "PMID":
					return "https://pubmed.ncbi.nlm.nih.gov/" + cleanPID;
				case "PMCID":
					return "https://pmc.ncbi.nlm.nih.gov/articles/" + cleanPID;
			}
		}
		return null;
	}

	/** Get the cleaned ID. By default we parse PIDs not in strict mode
	 * @returns The cleaned ID or null if it couldn't be cleaned
	 */
	get cleanID(): string | null {
		switch (this.type) {
			case "DOI":
				return Zotero.Utilities.cleanDOI(this.id);
			case "ISBN":
				return Zotero.Utilities.cleanISBN(this.id) || null;
			case "QID": {
				return PID.cleanQID(this.id);
			}
			case "OMID": {
				return PID.cleanOMID(this.id);
			}
			case "arXiv": {
				return PID.cleanArXiv(this.id);
			}
			case "OpenAlex": {
				return PID.cleanOpenAlex(this.id);
			}
			case "CorpusID": {
				const _semantic = parseInt(this.id.trim(), 10);
				const semantic = `${_semantic}`;
				if (!semantic) return null;
				return semantic;
			}
			case "PMID": {
				let id = this.id.trim();
				id = id.match(/\d+/)?.[0] ?? "";
				if (!id.match(/^\d+$/)) return null;
				return id;
			}
			case "PMCID": {
				let id = this.id.trim();
				id = id.match(/\d+/)?.[0] ?? "";
				id = "PMC" + id;
				if (!id.match(/^PMC\d+$/)) return null;
				return id;
			}
			default:
				return this.id;
		}
	}

	/**
	 * Clean the ID if possible
	 * @returns The cleaned ID or null if it couldn't be cleaned
	 */
	cleaned(): this | null {
		const cleanID = this.cleanID;
		if (cleanID) {
			this.id = cleanID;
			return this;
		} else {
			return null;
		}
	}

	/** Convert string to QID (eg. Q123). If this fails, return null
	 *
	 * @param qid string to convert to QID
	 * @param strict whether to require that the QID begins with a Q
	 * @returns QID or null
	 */
	static cleanQID(qid: string, strict: boolean = false): QID | null {
		qid = qid.toUpperCase().trim();
		if (!strict) {
			if (qid[0] !== "Q") qid = "Q" + qid;
		}
		// see https://www.wikidata.org/wiki/Q43649390 P1793
		if (qid.match(/^Q[1-9][0-9]*$/)) {
			return qid as QID;
		} else {
			return null;
		}
	}

	static cleanOMID(omid: string): OMID | null {
		omid = omid.toLowerCase().trim();
		if (/^https?:/.test(omid)) omid = omid.match(/br\/\d+/)?.[0] ?? "";
		if (omid.substring(0, 3) !== "br/") omid = "br/" + omid;
		if (!omid.match(/^br\/06[1-9]*0\d+$/)) return null;
		return omid as OMID;
	}

	static cleanArXiv(arXiv: string) {
		const arXiv_RE =
			/\b(([-A-Za-z.]+\/\d{7}|\d{4}\.\d{4,5})(?:v(\d+))?)(?!\d)/g; // 1: full ID, 2: ID without version, 3: version #
		const m = arXiv_RE.exec(arXiv);
		if (m) {
			return m[2];
		}
		return null;
	}

	static cleanOpenAlex(
		openAlex: string,
		strict: boolean = false,
	): OpenAlexID | null {
		openAlex = openAlex.trim();
		if (/^https?:/.test(openAlex))
			openAlex = openAlex.match(/[Ww]\d+/)?.[0] ?? "";
		openAlex = openAlex.toUpperCase();
		if (!strict) {
			if (openAlex[0] !== "W") openAlex = "W" + openAlex;
		}
		if (!openAlex.match(/^W\d+$/)) return null;
		return openAlex as OpenAlexID;
	}

	get zoteroIdentifier():
		| { DOI: string }
		| { ISBN: string }
		| { arXiv: string }
		| { adsBibcode: string }
		| { PMID: string }
		| null {
		return Zotero.Utilities.extractIdentifiers(this.id)[0] ?? null;
	}

	get comparable(): string | undefined {
		const rawID = this.cleanID?.toLowerCase();
		return rawID ? `${this.type}:${rawID}` : undefined;
	}

	static readonly allTypes: Set<PIDType> = new Set([
		"DOI",
		"ISBN",
		"QID",
		"OMID",
		"arXiv",
		"OpenAlex",
		"MAG",
		"CorpusID",
		"PMID",
		"PMCID",
	]);

	static readonly showable: Set<PIDType> = new Set([
		"DOI",
		"ISBN",
		"QID",
		"OMID",
		"arXiv",
		"OpenAlex",
		// "MAG" not showable due to deprecation
		"CorpusID",
		"PMID",
		"PMCID",
	]);

	static readonly alwaysShown: Set<PIDType> = new Set(["DOI"]);

	static readonly fetchable: Set<PIDType> = new Set([
		"DOI",
		"QID",
		"OMID",
		"OpenAlex",
		"CorpusID",
		// TODO PMID and PMCID could probably be fetched via NCBI NIH APIs
	]);

	static isEqual(a: PID, b: PID): boolean {
		if (a.type !== b.type) return false;
		const aComp = a.comparable;
		const bComp = b.comparable;
		return aComp !== null && aComp === bComp;
	}
}
