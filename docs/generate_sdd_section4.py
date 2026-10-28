# -*- coding: utf-8 -*-
"""Generate BuildMate SDD Section 4 from verified source-code inventories."""
from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

ORANGE = "F8CBAD"
HEADER_FONT = "Times New Roman"
BODY_SIZE = 11
TITLE_SIZE = 14
HEADING_SIZE = 13
SUB_SIZE = 12


def set_run_font(run, size=BODY_SIZE, bold=False, italic=False):
    run.font.name = HEADER_FONT
    run._element.rPr.rFonts.set(qn("w:eastAsia"), HEADER_FONT)
    run.font.size = Pt(size)
    run.bold = bold
    run.italic = italic
    run.font.color.rgb = RGBColor(0, 0, 0)


def shade(cell, color):
    tc = cell._tc
    tcPr = tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:fill"), color)
    shd.set(qn("w:val"), "clear")
    tcPr.append(shd)


def set_borders(table):
    tbl = table._tbl
    tblPr = tbl.tblPr if tbl.tblPr is not None else OxmlElement("w:tblPr")
    borders = OxmlElement("w:tblBorders")
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        el = OxmlElement(f"w:{edge}")
        el.set(qn("w:val"), "single")
        el.set(qn("w:sz"), "8")
        el.set(qn("w:space"), "0")
        el.set(qn("w:color"), "000000")
        borders.append(el)
    tblPr.append(borders)


def set_cell_text(cell, text, bold=False, center=False):
    cell.text = ""
    p = cell.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER if center else WD_ALIGN_PARAGRAPH.LEFT
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.space_after = Pt(2)
    run = p.add_run(text)
    set_run_font(run, BODY_SIZE, bold=bold)
    cell.vertical_alignment = 1


def add_table(doc, headers, rows):
    table = doc.add_table(rows=1 + len(rows), cols=len(headers))
    table.style = "Table Grid"
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = True
    set_borders(table)
    for i, h in enumerate(headers):
        set_cell_text(table.rows[0].cells[i], h, bold=True, center=True)
        shade(table.rows[0].cells[i], ORANGE)
    for r, row in enumerate(rows, start=1):
        for c, val in enumerate(row):
            set_cell_text(table.rows[r].cells[c], val, center=(c == 0))
    doc.add_paragraph()
    return table


def heading(doc, text, size=HEADING_SIZE, bold=True, italic=False):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(10)
    p.paragraph_format.space_after = Pt(6)
    run = p.add_run(text)
    set_run_font(run, size, bold=bold, italic=italic)
    return p


def body(doc, text, italic=False):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(6)
    run = p.add_run(text)
    set_run_font(run, BODY_SIZE, italic=italic)
    return p


def M(sig, desc):
    return (sig, desc)


def A(name, desc):
    return (name, desc)


def spec(name, kind, path, uc, methods, attrs):
    return {
        "name": name,
        "kind": kind,
        "path": path,
        "uc": uc,
        "methods": methods,
        "attrs": attrs,
    }


# Related use cases are inferred from routes/handlers because DOC 4 is not in the workspace.
SPECS = []

# -------------------- CONTROLLERS --------------------
SPECS += [
    spec(
        "AdminAuthController",
        "Controller",
        "backend/src/controllers/adminAuthController.js",
        "Admin login / session (inferred from adminAuthRoutes)",
        [
            M("login(req, res)", "Passes the request body to adminAuthService.login and returns the admin token payload."),
            M("me(req, res)", "Returns the authenticated admin profile via adminAuthService.me(req.user.id)."),
            M("logout(req, res)", "Invalidates the current admin session by incrementing token version through adminAuthService.logout."),
        ],
        [A("adminAuthService (Module)", "Admin authentication service used for login, profile, and logout.")],
    ),
    spec(
        "AdminController",
        "Controller",
        "backend/src/controllers/adminController.js",
        "Admin moderation, catalog, finance, analytics (inferred from adminRoutes)",
        [
            M("stats(_req, res)", "Returns partner-application counts (pending, approved, rejected, draft) from adminService.adminStats."),
            M("listCustomers(_req, res)", "Returns all customer accounts with last known city from repair addresses."),
            M("getCustomer(req, res)", "Returns one customer and related orders, reviews, and complaints by req.params.id."),
            M("list(req, res)", "Lists partner verification applications filtered by req.query.status."),
            M("getOne(req, res)", "Returns one partner application including eKYC public data."),
            M("approve(req, res)", "Approves a partner application using req.params.id and the admin id."),
            M("reject(req, res)", "Rejects a partner application with req.body.reason."),
            M("auditLogs(req, res)", "Lists audit records filtered by action and limit query parameters."),
            M("analytics(_req, res)", "Returns cached platform analytics from adminService.analytics."),
            M("financeSummary(_req, res)", "Builds the mock finance ledger via adminFinanceService.buildLedger."),
            M("listEscrows(_req, res)", "Returns the mock escrow register via adminFinanceService.listEscrows."),
            M("getCommissionRule(_req, res)", "Returns the active platform commission percentage."),
            M("setCommissionRule(req, res)", "Updates the commission rule from req.body as the current admin."),
            M("reviewCatalogService(req, res)", "Approves or rejects a custom catalog service from req.body.decision."),
            M("listCatalog(req, res)", "Lists catalog services for admin using q, category, and status filters."),
            M("createCatalog(req, res)", "Creates a system catalog service from req.body with adminId."),
            M("updateCatalog(req, res)", "Updates catalog service fields for req.params.id."),
            M("setCatalogStatus(req, res)", "Sets catalog service status from req.body.status."),
            M("listMaterialCategories(_req, res)", "Lists system and pending material categories for admin."),
            M("createMaterialCategory(req, res)", "Creates a system material category from req.body."),
            M("updateMaterialCategory(req, res)", "Renames a system material category by id."),
            M("reviewMaterialCategory(req, res)", "Approves or rejects a custom material category with optional reason."),
        ],
        [
            A("adminService (Module)", "Partner moderation, customer lookup, stats, commission, and audit listing."),
            A("catalogService (Module)", "Admin catalog create/update/review/status operations."),
            A("materialCategoryService (Module)", "Admin material-category create/update/review operations."),
            A("adminFinanceService (Module)", "Mock finance ledger and escrow register (loaded inside finance handlers)."),
            A("CATALOG_STATUS (Constant)", "Used to map review decision reject/approve onto catalog status."),
        ],
    ),
    spec(
        "AuthController",
        "Controller",
        "backend/src/controllers/authController.js",
        "Register, verify email, login, logout, forgot/reset password (inferred from authRoute)",
        [
            M("register(req, res)", "Creates a pending account via authService.register(req.body) and returns emailSent."),
            M("verifyEmail(req, res)", "Confirms the email OTP in req.body through authService.verifyEmail."),
            M("resendCode(req, res)", "Resends a verification OTP via authService.resendCode(req.body)."),
            M("login(req, res)", "Authenticates credentials via authService.login and returns the JWT payload."),
            M("logout(req, res)", "Logs out the current user by authService.logout(req.user.id)."),
            M("forgotPassword(req, res)", "Starts password reset OTP via authService.forgotPassword(req.body)."),
            M("verifyResetCode(req, res)", "Checks the reset OTP without changing the password."),
            M("resetPassword(req, res)", "Consumes the reset OTP and sets the new password from req.body."),
        ],
        [A("authService (Module)", "Account registration, OTP email verification, login, and password reset.")],
    ),
    spec(
        "ChatController",
        "Controller",
        "backend/src/controllers/chatController.js",
        "Chat rooms and messages (inferred from chatRoutes)",
        [
            M("rooms(req, res)", "Lists chat rooms for the authenticated user and role."),
            M("getRoom(req, res)", "Returns one room after membership check on req.params.roomId."),
            M("messages(req, res)", "Pages room messages using req.query (before, limit)."),
            M("send(req, res)", "Sends a text or location message after validating content or coordinates."),
            M("upload(req, res)", "Sends an image or video message using the uploaded file URL."),
        ],
        [
            A("chatService (Module)", "Room membership, listing, and message persistence."),
            A("publicFileUrl (Function)", "Converts uploaded media paths to public /uploads URLs."),
            A("MESSAGE_TYPE (Constant)", "Distinguishes TEXT, LOCATION, IMAGE, and VIDEO messages."),
            A("sanitizeChatLocation (Function)", "Validates latitude/longitude for location messages."),
        ],
    ),
    spec(
        "ComplaintController",
        "Controller",
        "backend/src/controllers/complaintController.js",
        "Order complaints and admin dispute handling (inferred from complaintRoutes)",
        [
            M("create(req, res)", "Opens a complaint for the current user from req.body."),
            M("mine(req, res)", "Lists complaints created by the current user."),
            M("adminList(req, res)", "Lists all complaints optionally filtered by req.query.status."),
            M("adminPatch(req, res)", "Applies admin status/note updates to req.params.id."),
        ],
        [A("complaintService (Module)", "Complaint create, list, and admin update logic.")],
    ),
    spec(
        "ContractorController",
        "Controller",
        "backend/src/controllers/contractorController.js",
        "Contractor/material-store workspace, profile, portfolio, verification, activation (inferred from contractorRoutes)",
        [
            M("getWorkspace(req, res)", "Loads the contractor workspace payload for the current user."),
            M("getMaterialWorkspace(req, res)", "Loads the material-store workspace payload for the current user."),
            M("getPublicProfile(req, res)", "Returns the contractor public-profile draft for editing."),
            M("updatePublicProfile(req, res)", "Saves contractor public-profile fields from req.body."),
            M("getProfile(req, res)", "Returns the private partner profile including verification state."),
            M("updateProfile(req, res)", "Updates partner profile fields from req.body."),
            M("uploadPortfolio(req, res)", "Adds a portfolio file URL to the named slot from req.body.slot."),
            M("removePortfolio(req, res)", "Removes a portfolio file by slot and URL."),
            M("createPortfolioProject(req, res)", "Creates an empty portfolio project for the contractor."),
            M("updatePortfolioProject(req, res)", "Updates project fields for req.params.projectId."),
            M("deletePortfolioProject(req, res)", "Deletes the portfolio project by id."),
            M("uploadProjectImage(req, res)", "Attaches an uploaded image to a portfolio project."),
            M("removeProjectImage(req, res)", "Removes a project image by URL."),
            M("uploadDocument(req, res)", "Stores a verification document of req.body.type."),
            M("removeDocument(req, res)", "Deletes a verification document by req.params.documentId."),
            M("requestVerificationChange(req, res)", "Requests a post-approval identity change with req.body.note."),
            M("submitVerification(req, res)", "Submits the partner application for admin review."),
            M("checkServiceCatalog(req, res)", "Classifies a typed service name via catalogService.classifyName."),
            M("listServiceCatalog(_req, res)", "Returns active catalog services for partner selection."),
            M("createCustomService(req, res)", "Creates a custom catalog proposal and attaches it to the contractor offerings."),
            M("getDashboardStats(req, res)", "Returns contractor dashboard aggregates for the current user."),
            M("getReputation(req, res)", "Returns contractor reputation plus public highlights."),
            M("getReviews(req, res)", "Pages contractor reviews using req.query."),
            M("activatePartner(req, res)", "Activates a ready partner storefront for public listing."),
            M("pausePartner(req, res)", "Pauses a live partner so the storefront is no longer public."),
        ],
        [
            A("contractorService (Module)", "Partner profile, documents, portfolio, verification, and workspace."),
            A("publicProfileService (Module)", "Public profile read/update and highlight loading."),
            A("reviewService (Module)", "Contractor review listing."),
            A("reputationService (Module)", "Contractor reputation score assembly."),
            A("catalogService (Module)", "Service-name classification and custom catalog proposals."),
            A("serviceService (Module)", "Attaches custom catalog proposals to contractor offerings."),
            A("dashboardService (Module)", "Contractor dashboard statistics."),
            A("activationService (Module)", "Partner activate/pause transitions."),
            A("publicFileUrl (Function)", "Builds public URLs for uploaded documents and images."),
        ],
    ),
    spec(
        "ContractorEkycController",
        "Controller",
        "backend/src/controllers/contractorEkycController.js",
        "Contractor eKYC capture and admin retake (inferred from contractor/admin routes)",
        [
            M("current(req, res)", "Returns the current user's eKYC public status."),
            M("saveDocument(req, res)", "Stores an ID-card image of req.body.type for the contractor profile."),
            M("readiness(req, res)", "Checks a live face frame against eKYC readiness rules."),
            M("validateFrame(req, res)", "Validates a liveness step frame plus optional reference/opposite images."),
            M("processVerification(req, res)", "Runs enroll/match using selfie and pose images."),
            M("submit(req, res)", "Submits a completed eKYC attempt for admin review."),
            M("file(req, res)", "Streams a private eKYC image to the owning contractor."),
            M("adminFile(req, res)", "Streams a private eKYC image to an admin by profile id and kind."),
            M("retake(req, res)", "Forces the partner to retake eKYC with req.body.reason."),
        ],
        [
            A("contractorEkycService (Module)", "eKYC persistence, AI calls, submit, file open, and retake."),
            A("fs (Module)", "Streams private image files to the HTTP response."),
        ],
    ),
    spec(
        "FeaturedProviderController",
        "Controller",
        "backend/src/controllers/featuredProviderController.js",
        "Home featured contractors and stores (inferred from publicRoutes)",
        [
            M("featured(_req, res)", "Returns ranked featured contractors and material stores from cache."),
        ],
        [A("featuredProviderService (Module)", "Loads, scores, and caches featured provider cards.")],
    ),
    spec(
        "LocationController",
        "Controller",
        "backend/src/controllers/locationController.js",
        "Nearby search and VietMap address lookup (inferred from locationRoutes)",
        [
            M("nearbyStores(req, res)", "Finds nearby material/service stores by lat, lng, radius, category, rating, and type."),
            M("nearbyContractors(req, res)", "Finds nearby contractors using the same geo filters."),
            M("autocomplete(req, res)", "Returns VietMap address suggestions for req.query.q with optional focus coordinates."),
            M("place(req, res)", "Resolves a VietMap place by refId and prefers a stored location correction when available."),
            M("reverse(req, res)", "Reverse-geocodes req.query.lat and lng through VietMap."),
        ],
        [
            A("locationService (Module)", "Geo nearby search for stores and contractors."),
            A("vietmapService (Module)", "Autocomplete, place, and reverse geocoding against VietMap."),
            A("locationCorrection (Module)", "Applies confirmed coordinate corrections to place results."),
        ],
    ),
    spec(
        "MarketplaceController",
        "Controller",
        "backend/src/controllers/marketplaceController.js",
        "Public store/contractor pages and catalog search (inferred from marketplaceRoutes)",
        [
            M("getStore(req, res)", "Returns a public material-store page by req.params.id."),
            M("getContractor(req, res)", "Returns a public contractor page by req.params.id."),
            M("searchMaterials(req, res)", "Searches public materials using category, keyword, and store query params."),
            M("searchServices(req, res)", "Searches public contractor services using the same query shape."),
        ],
        [A("marketplaceService (Module)", "Public marketplace reads and catalog search.")],
    ),
    spec(
        "MaterialCheckoutController",
        "Controller",
        "backend/src/controllers/material-checkout.controller.js",
        "Material delivery quote (inferred from material-checkout.routes)",
        [
            M("quote(req, res)", "Calculates a material delivery quote from req.body line items and destination."),
        ],
        [A("checkoutService (Module)", "Material checkout quote and order-prepare calculations.")],
    ),
    spec(
        "MaterialController",
        "Controller",
        "backend/src/controllers/materialController.js",
        "Material products, categories, store categories, public profile (inferred from materialStoreRoutes)",
        [
            M("list(req, res)", "Lists materials belonging to req.store."),
            M("create(req, res)", "Creates a material product in the current store from req.body."),
            M("update(req, res)", "Updates a material by req.params.id in the current store."),
            M("remove(req, res)", "Deletes or unpublishes a material that is referenced by orders."),
            M("listCategories(req, res)", "Lists material categories available to the store owner."),
            M("checkCategory(req, res)", "Classifies a typed category name for the owner."),
            M("createCategory(req, res)", "Creates a custom material category pending admin review."),
            M("registerCategory(req, res)", "Registers an existing or new category onto the store profile."),
            M("listStoreCategories(req, res)", "Lists owner-defined storefront category tabs."),
            M("createStoreCategory(req, res)", "Creates a storefront category tab from req.body."),
            M("updateStoreCategory(req, res)", "Updates a storefront category tab by id."),
            M("removeStoreCategory(req, res)", "Deletes a storefront category tab by id."),
            M("getPublicProfile(req, res)", "Returns the material-store public profile for editing."),
            M("updatePublicProfile(req, res)", "Saves material-store public profile fields."),
        ],
        [
            A("materialService (Module)", "Material product CRUD for a store."),
            A("materialCategoryService (Module)", "Owner and admin material-category workflows."),
            A("storeCategoryService (Module)", "Storefront category-tab CRUD."),
            A("publicProfileService (Module)", "Material-store public profile read/update."),
        ],
    ),
    spec(
        "MaterialOrderController",
        "Controller",
        "backend/src/controllers/material-order.controller.js",
        "Material orders, deposit, receive, store fulfilment (inferred from material-order.routes)",
        [
            M("createOrder(req, res)", "Creates a material order from the current user and req.body."),
            M("listMine(req, res)", "Lists material orders placed by the current customer."),
            M("getMine(req, res)", "Returns one customer material order by id."),
            M("cancelMine(req, res)", "Cancels the customer's material order when still cancellable."),
            M("checkoutDeposit(req, res)", "Starts mock deposit checkout for the order."),
            M("captureDeposit(req, res)", "Captures the mock deposit payment for the order."),
            M("receiveMine(req, res)", "Marks the order as received by the customer."),
            M("listStore(req, res)", "Lists material orders for req.store."),
            M("getStore(req, res)", "Returns one store-side material order by id."),
            M("earnings(req, res)", "Returns material-store earnings for req.store."),
            M("settleRemaining(req, res)", "Records the customer's remaining direct payment."),
            M("settleCollected(req, res)", "Records that the store collected the remaining amount."),
            M("updateStoreStatus(req, res)", "Updates fulfilment status from the store using req.body."),
        ],
        [
            A("orderService (Module)", "Material-order create, list, cancel, receive, settle, and store status."),
            A("depositService (Module)", "Material deposit checkout and capture."),
        ],
    ),
    spec(
        "NotificationController",
        "Controller",
        "backend/src/controllers/notificationController.js",
        "In-app notifications (inferred from notificationRoutes)",
        [
            M("list(req, res)", "Pages the current user's notifications with unread/page/limit filters."),
            M("readOne(req, res)", "Marks one notification as read for the current user."),
            M("readAll(req, res)", "Marks all notifications as read for the current user."),
        ],
        [A("notificationService (Module)", "Notification list and read-state updates.")],
    ),
    spec(
        "OrderController",
        "Controller",
        "backend/src/controllers/orderController.js",
        "Service orders, complete/cancel, escrow (inferred from orderRoutes)",
        [
            M("listCustomer(req, res)", "Lists service orders for the authenticated customer."),
            M("listContractor(req, res)", "Lists service orders for the authenticated contractor."),
            M("getOne(req, res)", "Returns one service order after party authorization."),
            M("complete(req, res)", "Marks the order completed by the customer."),
            M("cancel(req, res)", "Cancels the order with req.body.reason."),
            M("confirmRemaining(req, res)", "Records the remaining direct payment through escrowService.confirmRemaining."),
            M("settleEscrow(req, res)", "Settles mock escrow for the order."),
            M("adminRefundEscrow(req, res)", "Admin-refunds mock escrow using reason, cancelCase, and amount."),
        ],
        [
            A("orderService (Module)", "Service-order list, get, complete, and cancel."),
            A("escrowService (Module)", "Remaining payment, settlement, and admin refund (loaded in those handlers)."),
        ],
    ),
    spec(
        "PaymentController",
        "Controller",
        "backend/src/controllers/paymentController.js",
        "Service-order payments, refunds, contractor earnings (inferred from paymentRoutes)",
        [
            M("checkout(req, res)", "Starts mock checkout for payment req.params.id with terms fields from req.body."),
            M("mockSuccess(req, res)", "Captures the mock payment as successful for the payer."),
            M("listForOrder(req, res)", "Lists payments belonging to req.params.orderId for an authorized party."),
            M("refund(req, res)", "Refunds a payment as admin with req.body.reason."),
            M("earnings(req, res)", "Returns commission earnings for the authenticated contractor."),
        ],
        [
            A("paymentService (Module)", "Checkout, capture, list, and refund of service-order payments."),
            A("commissionService (Module)", "Contractor earnings aggregation."),
        ],
    ),
    spec(
        "PolicyController",
        "Controller",
        "backend/src/controllers/policyController.js",
        "Legal policies and revisions (inferred from policyRoutes)",
        [
            M("list(req, res)", "Lists policies using search/type/status/language query filters."),
            M("getOne(req, res)", "Returns one policy by id."),
            M("active(req, res)", "Returns the active policy for type and language query params."),
            M("create(req, res)", "Creates a policy from req.body as the current admin actor."),
            M("update(req, res)", "Updates policy content and records a revision."),
            M("history(req, res)", "Returns revision history for a policy id."),
        ],
        [A("policyService (Module)", "Policy CRUD, active lookup, sanitization, and history.")],
    ),
    spec(
        "ProgressController",
        "Controller",
        "backend/src/controllers/progressController.js",
        "Job progress updates (inferred from progressRoutes)",
        [
            M("list(req, res)", "Lists progress updates for order req.params.id after party checks."),
            M("create(req, res)", "Adds a progress update with uploaded images and optional coordinates."),
        ],
        [
            A("progressService (Module)", "Progress listing and creation with escrow side effects."),
            A("publicFileUrl (Function)", "Converts uploaded progress photos to public URLs."),
        ],
    ),
    spec(
        "QuotationController",
        "Controller",
        "backend/src/controllers/quotationController.js",
        "Quotations and customer accept/reject/modify (inferred from quotationRoutes)",
        [
            M("create(req, res)", "Creates a contractor quotation from req.body."),
            M("getOne(req, res)", "Returns one quotation after party authorization."),
            M("listForRequest(req, res)", "Lists quotations for a repair request."),
            M("accept(req, res)", "Accepts the quotation and creates the service order."),
            M("reject(req, res)", "Rejects the quotation as the customer."),
            M("requestModification(req, res)", "Requests quotation changes with req.body.note."),
        ],
        [A("quotationService (Module)", "Quotation create, list, and customerAction accept/reject/modify.")],
    ),
    spec(
        "RepairController",
        "Controller",
        "backend/src/controllers/repairController.js",
        "Repair requests create/list/accept/reject (inferred from repairRoutes)",
        [
            M("create(req, res)", "Creates a repair request with uploaded images/videos merged into the body."),
            M("mine(req, res)", "Lists repair requests created by the current customer."),
            M("received(req, res)", "Lists incoming repair requests for the current contractor."),
            M("getOne(req, res)", "Returns one repair request after access checks."),
            M("accept(req, res)", "Sets the request status to ACCEPTED for the contractor."),
            M("reject(req, res)", "Sets the request status to REJECTED for the contractor."),
        ],
        [
            A("repairService (Module)", "Repair-request create, list, get, and status changes."),
            A("publicFileUrl (Function)", "Maps uploaded media files to public URLs."),
        ],
    ),
    spec(
        "ReviewController",
        "Controller",
        "backend/src/controllers/reviewController.js",
        "Contractor and material-store reviews (inferred from reviewRoutes)",
        [
            M("create(req, res)", "Creates a contractor review from the current customer."),
            M("createMaterial(req, res)", "Creates a material-store review from the current customer."),
            M("listStore(req, res)", "Lists reviews for the authenticated material-store owner."),
            M("storeReputation(req, res)", "Returns reputation for the authenticated material-store owner."),
            M("listForUser(req, res)", "Lists public reviews for a user id, switching contractor vs store by targetType."),
            M("reply(req, res)", "Saves a contractor reply on review req.params.id."),
            M("report(req, res)", "Reports a review with req.body.reason."),
        ],
        [
            A("reviewService (Module)", "Review create, list, reply, and report."),
            A("reputationService (Module)", "Material-store reputation used by storeReputation."),
        ],
    ),
    spec(
        "ServiceController",
        "Controller",
        "backend/src/controllers/serviceController.js",
        "Contractor service offerings (inferred from contractor/store routes)",
        [
            M("list(req, res)", "Lists services for the current store and contractor."),
            M("register(req, res)", "Registers a catalog service onto the store using req.body.catalogKey."),
            M("update(req, res)", "Updates an offering by id with price/description payload."),
            M("remove(req, res)", "Deletes an offering from the store."),
        ],
        [A("serviceService (Module)", "Contractor offering list/register/update/delete.")],
    ),
    spec(
        "ServiceSuggestionController",
        "Controller",
        "backend/src/controllers/serviceSuggestionController.js",
        "Contractor service suggestions to admin (inferred from serviceSuggestionRoutes)",
        [
            M("create(req, res)", "Creates a contractor suggestion with description and profile."),
            M("list(_req, res)", "Lists suggestions for admin review."),
            M("reject(req, res)", "Rejects a suggestion with adminNote."),
            M("convert(req, res)", "Converts a suggestion into a catalog service using req.body."),
        ],
        [A("serviceSuggestionService (Module)", "Suggestion create, admin list, reject, and convert.")],
    ),
    spec(
        "StoreController",
        "Controller",
        "backend/src/controllers/storeController.js",
        "Partner storefront CRUD (inferred from contractor/material store routes)",
        [
            M("getStore(req, res)", "Returns the current user's storefront."),
            M("createStore(req, res)", "Creates a storefront locked to SERVICES or MATERIALS from the user role."),
            M("updateStore(req, res)", "Updates storefront fields while keeping the locked store type."),
            M("deleteStore(req, res)", "Removes the current user's storefront."),
        ],
        [
            A("storeService (Module)", "Storefront get/create/update/delete and type enforcement."),
            A("STORE_TYPE (Constant)", "Used to lock MATERIALS vs SERVICES from the authenticated role."),
        ],
    ),
    spec(
        "UploadController",
        "Controller",
        "backend/src/controllers/uploadController.js",
        "Generic authenticated file upload (inferred from uploadRoutes)",
        [
            M("create(req, res)", "Returns URL, name, mime, size, and scope for a multer-uploaded file."),
        ],
        [
            A("publicFileUrl (Function)", "Converts the stored file path to a public URL."),
            A("UPLOAD_SCOPES (Constant)", "Maps req.params.scope onto upload folders."),
        ],
    ),
    spec(
        "UserController",
        "Controller",
        "backend/src/controllers/userController.js",
        "User profile, password, avatar (inferred from userRoutes)",
        [
            M("getProfile(req, res)", "Returns the authenticated user's public profile."),
            M("updateProfile(req, res)", "Updates profile fields from req.body as the current actor."),
            M("changePassword(req, res)", "Changes password using currentPassword and newPassword in req.body."),
            M("updateAvatar(req, res)", "Sets avatar from the uploaded file URL."),
        ],
        [
            A("userService (Module)", "Profile read/update, password change, and avatar update."),
            A("publicFileUrl (Function)", "Builds the avatar URL from the uploaded file."),
        ],
    ),
]

CONTROLLER_SPECS = SPECS
