import type { Metadata } from "next";
import PageNav from "@/components/PageNav";
import SeriesCard from "@/components/SeriesCard";
import SchoolFinder from "@/components/SchoolFinder";
import ViewToggle from "@/components/ViewToggle";
import { card, link } from "@/components/BudgetParts";
import { Header, KeyFigures, SectionTitle, Shell } from "@/components/SectionParts";
import { SCHOOLS, TEST_LABELS } from "@/lib/schools";
import type { Series } from "@/lib/types";

export const metadata: Metadata = { title: "Schools · Toronto Civic Data" };

// Board trends are built here from lib/schools.json (scripts/extract_schools.py), which carries
// a source per school year; the series below point their citation at the latest year's file and
// list every year's file in the method.

const SHORT: Record<string, string> = { "Toronto DSB": "TDSB", "Toronto CDSB": "TCDSB", "CS Viamonde": "Viamonde", "CS catholique MonAvenir": "MonAvenir" };

export default function SchoolsPage() {
  const years = SCHOOLS.schoolYears, last = years[years.length - 1];
  const files = years.map(y => `${y}: ${SCHOOLS.yearMeta[y].fileUrl}`).join(" · ");
  const carried = (y: string) => SCHOOLS.yearMeta[y].eqaoCarriedFrom;

  const enrolment: Series[] = SCHOOLS.boards.map(b => ({
    id: `enrol-${b.board}`, label: SHORT[b.board] ?? b.board, unit: "count",
    points: years.map(y => ({ period: y, value: b.enrolment[y]?.value ?? null, note: y === "2020–21" ? "The 2020–21 file's school rows add up to far less than the years around it" : undefined })),
    source: { ...SCHOOLS.sources[last].enrolment, method: `${SCHOOLS.sources[last].enrolment.method} Files by school year — ${files}` },
  }));
  const test = (k: string): Series[] => SCHOOLS.boards.map(b => ({
    id: `${k}-${b.board}`, label: `${SHORT[b.board] ?? b.board}`, unit: "percent",
    points: years.map(y => {
      const v = b.tests[k][y];
      return { period: y, value: v?.value ?? null, note: carried(y) ? `Repeats ${carried(y)} results (no tests were given)` : undefined };
    }),
    source: { ...SCHOOLS.sources[last].tests, method: `${SCHOOLS.sources[last].tests.method} Files by school year — ${files}` },
    note: `Schools with a result in ${last}: ${SCHOOLS.boards.map(b => `${SHORT[b.board] ?? b.board} ${b.tests[k][last]?.schools ?? 0}`).join(", ")}. With few schools, the French boards' medians swing from year to year.`,
  }));
  const tdsb = SCHOOLS.boards.find(b => b.board === "Toronto DSB")!, tcdsb = SCHOOLS.boards.find(b => b.board === "Toronto CDSB")!;
  const total = SCHOOLS.boards.reduce((s, b) => s + (b.enrolment[last]?.value ?? 0), 0);

  return (
    <Shell>
      <PageNav />
      <Header title="Schools">
        Toronto&apos;s publicly funded schools from {years[0]}{" "}to {last}: enrolment and provincial test results (EQAO) by board, and a
        page for each of the {SCHOOLS.schools.length}{" "}schools. From the Ontario Ministry of Education&apos;s school information files.
      </Header>

      <KeyFigures items={[
        { label: `Students enrolled, ${last}`, value: total.toLocaleString("en-CA"), sub: "Sum of school enrolments in the four boards below" },
        { label: `TDSB schools`, value: String(tdsb.schools), sub: `${tdsb.enrolment[last].value.toLocaleString("en-CA")} students` },
        { label: `TCDSB schools`, value: String(tcdsb.schools), sub: `${tcdsb.enrolment[last].value.toLocaleString("en-CA")} students` },
      ]} />

      <section style={{ ...card, marginTop: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 10px" }}>Find a school</h2>
        <SchoolFinder schools={SCHOOLS.schools.map(({ id, name, board, level, area }) => ({ id, name, board, level, area }))} />
      </section>

      <SectionTitle>Enrolment</SectionTitle>
      <SeriesCard
        title="Students enrolled, by board"
        blurb="The sum of each school's enrolment in the Ministry's file (the Ministry rounds each school to the nearest 5). The 2020–21 file's rows add up to far less than other years and it lists no virtual schools; the sum is shown as the file gives it."
        series={enrolment} kind="line"
      />

      <SectionTitle>Test results</SectionTitle>
      <section style={{ marginTop: 0 }}>
        <ViewToggle label="Test" storageKey="schools-test" views={Object.keys(TEST_LABELS).map(k => ({
          id: k, label: TEST_LABELS[k].replace(" (OSSLT), first try", ""),
          content: (
            <SeriesCard
              title={`${TEST_LABELS[k]}: the median school's share meeting the provincial standard`}
              blurb={<>For each board, the middle school when its schools are ranked by the share of students who met the standard. Schools with too few students to report are left out. No tests were given in the pandemic years; those files repeat the 2018–19 results, drawn faded here.</>}
              series={test(k)} kind="line"
            />
          ),
        }))} />
      </section>

      <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: "16px 0 0", lineHeight: 1.5 }}>
        The Ministry randomly rounds percentages and doesn&apos;t report figures for fewer than 10 students, so a school&apos;s 0% or 100%
        may not be exact. Codes such as N/R and N/D are shown as the files give them; the Ministry&apos;s{" "}
        <a href={SCHOOLS.glossaryUrl} target="_blank" rel="noopener noreferrer" style={link}>glossary</a> describes its terms.
      </p>
    </Shell>
  );
}
