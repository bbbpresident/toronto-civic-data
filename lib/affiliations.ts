import type { Affiliation } from "@/lib/types";

// Party roles for mayoral candidates, hand-curated. The City's results files carry no party
// information, so this is the one part of the section that isn't generated.
//
// An entry goes here only when an official record (a legislature's member page) states it.
// `role` quotes what that record says, with dates. Candidates without an entry show "—",
// meaning "none recorded here", not "independent".
//
// Keyed by normalized display name (see affiliationKey).

const ACCESSED = "2026-10-31";

const AFFILIATIONS: Record<string, Affiliation> = {
  "john tory": {
    party: "Progressive Conservative Party of Ontario",
    role: "MPP, Dufferin—Peel—Wellington—Grey, Mar 17 2005 – Oct 9 2007",
    source: { publisher: "Legislative Assembly of Ontario", title: "John Tory — member record", url: "https://www.ola.org/en/members/all/john-tory", accessed: ACCESSED },
  },
  "george smitherman": {
    party: "Ontario Liberal Party",
    role: "MPP, Toronto Centre (earlier Toronto Centre—Rosedale), Jun 3 1999 – Jan 3 2010",
    source: { publisher: "Legislative Assembly of Ontario", title: "George Smitherman — member record", url: "https://www.ola.org/en/members/all/george-smitherman", accessed: ACCESSED },
  },
  "mitzie hunter": {
    party: "Ontario Liberal Party",
    role: "MPP, Scarborough—Guildwood, Aug 1 2013 – May 10 2023",
    source: { publisher: "Legislative Assembly of Ontario", title: "Mitzie Hunter — member record", url: "https://www.ola.org/en/members/all/mitzie-hunter", accessed: ACCESSED },
  },
  "doug ford": {
    party: "Progressive Conservative Party of Ontario",
    role: "MPP, Etobicoke North, Jun 7 2018 – present (after his 2014 mayoral run)",
    source: { publisher: "Legislative Assembly of Ontario", title: "Doug Ford — member record", url: "https://www.ola.org/en/members/all/doug-ford", accessed: ACCESSED },
  },
  "olivia chow": {
    party: "New Democratic Party (NDP)",
    role: "MP, Trinity—Spadina, Jan 23 2006 – Mar 12 2014",
    source: { publisher: "House of Commons of Canada", title: "Olivia Chow — roles", url: "https://www.ourcommons.ca/members/en/olivia-chow(20816)/roles", accessed: ACCESSED },
  },
  "john nunziata": {
    party: "Independent",
    role: "MP, York South—Weston, Jun 2 1997 – Nov 26 2000",
    source: { publisher: "House of Commons of Canada", title: "John Nunziata — roles", url: "https://www.ourcommons.ca/Members/en/john-nunziata(1121)/roles", accessed: ACCESSED },
  },
};

export function affiliationKey(displayName: string): string {
  return displayName.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z ]/g, "").trim();
}

export function getAffiliation(displayName: string): Affiliation | undefined {
  return AFFILIATIONS[affiliationKey(displayName)];
}
