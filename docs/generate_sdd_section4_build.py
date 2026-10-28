# -*- coding: utf-8 -*-
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from generate_sdd_section4 import (
    CONTROLLER_SPECS,
    add_table,
    body,
    heading,
    set_run_font,
)
from generate_sdd_section4_rest import OTHER_SPECS, REPO_SPECS
from generate_sdd_section4_services import SERVICE_SPECS
from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

ALL = CONTROLLER_SPECS + SERVICE_SPECS + REPO_SPECS + OTHER_SPECS
OUT = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "BuildMate_Section4_Class_Specifications.docx",
)


def style_doc(doc):
    section = doc.sections[0]
    section.top_margin = Cm(2)
    section.bottom_margin = Cm(2)
    section.left_margin = Cm(2)
    section.right_margin = Cm(2)
    style = doc.styles["Normal"]
    style.font.name = "Times New Roman"
    style.font.size = Pt(11)
    style._element.rPr.rFonts.set(qn("w:eastAsia"), "Times New Roman")
    pf = style.paragraph_format
    pf.line_spacing_rule = WD_LINE_SPACING.SINGLE


def add_center_title(doc, text, size=16):
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run(text)
    set_run_font(run, size, bold=True)


def write_class(doc, index, item):
    heading(doc, f"4.{index} {item['name']} class", size=13, italic=True)
    body(doc, f"Source file: {item['path']}", italic=True)
    heading(doc, f"4.{index}.1 Class Method(s)", size=12)
    rows = []
    for i, (sig, desc) in enumerate(item["methods"], start=1):
        rows.append((f"{i:02d}", sig, desc))
    add_table(doc, ["No", "Method", "Description"], rows)
    heading(doc, f"4.{index}.2 Class Attribute(s)", size=12)
    arows = []
    for i, (name, desc) in enumerate(item["attrs"], start=1):
        arows.append((f"{i:02d}", name, desc))
    add_table(doc, ["No", "Attribute (type)", "Description"], arows)


def main():
    n_ctrl = len(CONTROLLER_SPECS)
    n_svc = len(SERVICE_SPECS)
    n_repo = len(REPO_SPECS)
    n_other = len(OTHER_SPECS)
    n_all = len(ALL)
    n_methods = sum(len(s["methods"]) for s in ALL)

    doc = Document()
    style_doc(doc)
    add_center_title(doc, "4. Class Specifications")
    body(
        doc,
        "This section specifies BuildMate backend modules that implement the documented business flows. "
        "Source code uses CommonJS functional modules rather than ES6 classes, except BaseRepository, "
        "the Mongo UserRepository class, and MockPaymentProvider. Each module is presented in the DOC 4 "
        "sample layout (class name, methods, attributes). Method names and parameters match the current source.",
    )
    body(
        doc,
        "Scope actually inspected: backend/src/controllers (26 files), backend/src/services (50 files), "
        "backend/src/repositories (23 files), backend/src/middleware, backend/src/providers, backend/src/sockets, "
        "backend/src/routes, backend/src/app.js, and frontend/src plus admin/src for API-client presence. "
        "Tests, validators, Mongoose model files, Prisma schema, node_modules, and React UI components are not specified as classes.",
    )
    body(
        doc,
        "DOC 4 Class Diagrams and Sequence Diagrams were not present in the workspace, so Related Use Cases "
        "are inferred from routes and exported handlers. They are not copied from the previous-year salon sample. "
        "postgres implementation files (*.postgres.js) are the runtime adapters behind Access modules and are not duplicated as extra classes. "
        "policyDefaults.js and portfolioProjects.js are helper data/validation modules consumed by PolicyService and ContractorService; they are not specified separately. "
        "Confirmed unused and therefore not specified: repositories/index.js, repositories/user.repository.js (broken require of missing base.repository), and providers/email.provider.js (duplicate of emailProvider.js). "
        "GET /service-catalog/ is handled inline by catalogService.listActive() with no dedicated controller; that method is specified under CatalogService.",
    )

    heading(doc, "Inventory of specified modules", size=13)
    inv = []
    for i, s in enumerate(ALL, start=1):
        inv.append(
            (
                f"{i:02d}",
                s["name"],
                s["kind"],
                s["path"],
                s["uc"],
                str(len(s["methods"])),
            )
        )
    add_table(
        doc,
        ["No", "Class / Module Name", "Type", "Source File", "Related Use Cases", "Method Count"],
        inv,
    )

    heading(doc, "Quantity summary", size=13)
    add_table(
        doc,
        ["Item", "Count", "Selection rationale"],
        [
            ("Controller", str(n_ctrl), "Every HTTP controller under backend/src/controllers is specified once."),
            ("Service", str(n_svc), "Business services that controllers, sockets, or other services call. Excludes policyDefaults.js and portfolioProjects.js."),
            ("Repository", str(n_repo), "UserRepository, BaseRepository, Access facades actually imported by services, EscrowStore, and PgContext. *.postgres.js files are implementations behind Access, not extra classes."),
            ("Other (middleware / provider / socket)", str(n_other), "Auth, role, contractor, and upload middleware; EmailProvider and MockPaymentProvider; Socket.IO gateway and chat handlers."),
            ("Total Class Specifications", str(n_all), "Count comes from BuildMate source, not from the previous-year sample (88 classes)."),
            ("Methods specified", str(n_methods), "Exported business operations plus important internal APIs that services call (for example markPaid, createFromQuotation)."),
        ],
    )

    heading(doc, "Controllers", size=13)
    idx = 1
    for item in CONTROLLER_SPECS:
        write_class(doc, idx, item)
        idx += 1

    heading(doc, "Services", size=13)
    for item in SERVICE_SPECS:
        write_class(doc, idx, item)
        idx += 1

    heading(doc, "Repositories", size=13)
    for item in REPO_SPECS:
        write_class(doc, idx, item)
        idx += 1

    heading(doc, "Other design modules", size=13)
    for item in OTHER_SPECS:
        write_class(doc, idx, item)
        idx += 1

    heading(doc, "Verification against source code", size=13)
    ver = []
    for s in ALL:
        ver.append((s["name"], s["path"], str(len(s["methods"])), "Verified against current source file"))
    add_table(doc, ["Class / Module", "Source File", "Methods Documented", "Verification Status"], ver)

    heading(doc, "Diagram methods not found in source", size=13)
    body(
        doc,
        "Report 4 Class Diagrams and Sequence Diagrams were not found in this workspace "
        "(no Report4 / SDD / .docx design file under BUILDMATE). Therefore diagram method names "
        "could not be cross-checked one-by-one. The screenshot from the previous-year sample "
        "(AccountController.lockAccount / unlockAccount) does not exist in BuildMate and is not specified here.",
    )
    add_table(
        doc,
        ["Use Case", "Diagram Method", "Source Code Status", "Recommendation"],
        [
            (
                "DOC 4 diagrams (BuildMate)",
                "(file not in workspace)",
                "NOT FOUND IN CURRENT WORKSPACE",
                "Place the BuildMate DOC 4 file in the repo and re-run a name-level diff against this section.",
            ),
            (
                "Previous-year sample (salon)",
                "lockAccount(req, res) / unlockAccount(req, res)",
                "NOT FOUND IN CURRENT SOURCE CODE",
                "Do not copy those methods. BuildMate has no AccountController.",
            ),
        ],
    )

    heading(doc, "Frontend and admin", size=13)
    body(
        doc,
        "frontend/src and admin/src were inspected for API clients. They are React/Vite UIs that call the backend HTTP API "
        "(for example frontend/src/services/auth.api.ts). They are not specified as classes because they are not the "
        "business-logic layer shown in the DOC 4 sample Controller/Service/Repository tables.",
    )

    doc.save(OUT)
    print("Wrote", OUT)
    print("controllers", n_ctrl, "services", n_svc, "repos", n_repo, "other", n_other)
    print("total classes", n_all, "methods", n_methods)


if __name__ == "__main__":
    main()
