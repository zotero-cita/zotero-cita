import PID from "../cita/PID";

// An OMID is br/[0-9]+
// An OCI consists of 2 OMIDs with their `br/` prefixes removed joined by a -

export default class OCI {
	static getOci(citingId: OMID | string, citedId: OMID | string): string {
		if (typeof citingId === "string") {
			const cleanCitingId = new PID("OMID", citingId).cleanID;
			if (cleanCitingId === null) {
				throw new Error(
					`${citingId} isn't a valid OMID so can't be used to construct an OCI`,
				);
			}
			citingId = cleanCitingId;
		}

		if (typeof citedId === "string") {
			const cleanCitedId = new PID("OMID", citedId).cleanID;
			if (cleanCitedId === null) {
				throw new Error(
					`${citedId} isn't a valid OMID so can't be used to construct an OCI`,
				);
			}
			citedId = cleanCitedId;
		}

		return this._getOci(citingId as OMID, citedId as OMID);
	}

	private static _getOci(citingId: OMID, citedId: OMID): string {
		// remove the br/ prefix from each OMID to construct the OCI
		return `${citingId.replace(/^br\//, "")}-${citedId.replace(/^br\//, "")}`;
	}

	static parseOci(oci: string) {
		const match = oci.match(/^([0-9]+)-([0-9]+)$/);
		if (!match) {
			throw new Error("Wrong OCI format");
		}
		const [citing, cited] = match;
		const citingOMID = new PID("OMID", "br/" + citing).cleanID as OMID;
		const citedOMID = new PID("OMID", "br/" + cited).cleanID as OMID;
		return {
			citingOMID,
			citedOMID,
		};
	}

	/**
	 * Resolve OCI with OCI Resolution Service
	 * @param {String} oci - OCI to resolve
	 */
	static resolve(oci: string) {
		if (this.parseOci(oci)) {
			Zotero.launchURL("https://w3id.org/oc/index/ci/" + oci);
		}
	}
}
