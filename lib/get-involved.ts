import type { PageSource } from "@/lib/types";

// Ways to take part, each an official City of Toronto page (checked on the date given). Hand-curated:
// add a link only from toronto.ca, and re-check them when you edit this list.

export interface Action { title: string; blurb: string; href: string; cta: string; source: PageSource }

const city = (title: string, url: string): PageSource => ({ publisher: "City of Toronto", title, url, accessed: "2026-11-02" });

export const ACTIONS: Action[] = [
  { title: "Get your event on the City's calendar", cta: "Submit an event",
    blurb: "Hosting a festival, market or community event? The City's Festivals & Events calendar is free to list on, and it's what powers the calendar on this site.",
    href: "https://www.toronto.ca/explore-enjoy/festivals-events/festivals-events-calendar/festivals-and-events-calendar-submission/",
    source: city("Festivals & Events Calendar – Submit an Event", "https://www.toronto.ca/explore-enjoy/festivals-events/festivals-events-calendar/festivals-and-events-calendar-submission/") },
  { title: "Email the mayor", cta: "mayor_chow@toronto.ca",
    blurb: "Write to Mayor Olivia Chow's office at City Hall, 100 Queen Street West. Phone: 416-397-CITY (2489).",
    href: "mailto:mayor_chow@toronto.ca",
    source: city("Office of the Mayor – staff directory (dated 2026-03-01)", "https://www.toronto.ca/wp-content/uploads/2017/12/954d-mayor.pdf") },
  { title: "Invite the mayor to your event", cta: "Send an invitation",
    blurb: "Ask for the mayor to attend or bring greetings to a community event.",
    href: "https://www.toronto.ca/city-government/council/office-of-the-mayor/invite-the-mayor-to-an-event/",
    source: city("Invite the Mayor", "https://www.toronto.ca/city-government/council/office-of-the-mayor/invite-the-mayor-to-an-event/") },
  { title: "Contact your councillor", cta: "Find your councillor",
    blurb: "Each of the 25 wards has a councillor. Their pages list phone numbers, email and office hours.",
    href: "https://www.toronto.ca/city-government/council/members-of-council/",
    source: city("Members of Council", "https://www.toronto.ca/city-government/council/members-of-council/") },
  { title: "Report a problem or ask for a service", cta: "Contact 311",
    blurb: "Potholes, missed garbage, graffiti, broken streetlights, noise and more: submit a service request and track it.",
    href: "https://www.toronto.ca/home/311-toronto-at-your-service/submit-a-service-request-or-feedback/",
    source: city("311 – Submit a Service Request or Feedback", "https://www.toronto.ca/home/311-toronto-at-your-service/submit-a-service-request-or-feedback/") },
  { title: "Speak at a committee meeting", cta: "Have your say",
    blurb: "Anyone can speak to a City committee for up to five minutes on an agenda item, or send written comments.",
    href: "https://www.toronto.ca/city-government/council/council-committee-meetings/have-your-say/",
    source: city("Have Your Say at Council & Committee Meetings", "https://www.toronto.ca/city-government/council/council-committee-meetings/have-your-say/") },
  { title: "Close your street for a party or event", cta: "Street event permits",
    blurb: "Block parties, street festivals and parades need a street event permit.",
    href: "https://www.toronto.ca/services-payments/streets-parking-transportation/street-events/temporary-street-closure-permit/",
    source: city("Street Event Permits", "https://www.toronto.ca/services-payments/streets-parking-transportation/street-events/temporary-street-closure-permit/") },
  { title: "Plan a bigger event", cta: "Permit navigator",
    blurb: "The City's Special Events Permit Navigator walks you through the permits a larger event may need.",
    href: "https://www.toronto.ca/business-economy/industry-sector-support/events/special-events-permit-navigator/",
    source: city("Special Events Permit Navigator", "https://www.toronto.ca/business-economy/industry-sector-support/events/special-events-permit-navigator/") },
];
