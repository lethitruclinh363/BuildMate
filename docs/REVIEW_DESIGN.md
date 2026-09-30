# Review & rating design (Sprint 6 lock)

Related: [SPRINT6_ARCHITECTURE.md](./SPRINT6_ARCHITECTURE.md).

---

## 1. Hard rule

A review may be created **only if** `orders.status === COMPLETED`.

Any other status → **409**. Cancelled / in-progress / waiting customer → no review.

---

## 2. Who reviews whom

| Reviewer | Target | `targetType` | Sprint 6 |
| --- | --- | --- | --- |
| CUSTOMER | CONTRACTOR (order.contractorId) | `CONTRACTOR` | **Yes — service quality after handover** |
| CUSTOMER | Material store on the order (`MATERIALS` or `BOTH`) | `MATERIAL_STORE` | **Yes — only when that store applies** |
| CONTRACTOR | CUSTOMER | `CUSTOMER` | **No** |

**S6-D8:** contractor→customer reviews are deferred. They invite retaliation and need moderation the thesis will not ship.

UI: after the customer accepts the finished work, they rate the contractor’s service quality. A second card appears only when the order’s store sells materials.

---

## 3. Collection `reviews`

One order may have one contractor review and, when a material store applies, one material-store review.

| Field | Type | Notes |
| --- | --- | --- |
| `orderId` | ObjectId → orders | |
| `customerId` | ObjectId → users | must equal `order.customerId` |
| `targetUserId` | ObjectId → users | contractor user, or the material store owner |
| `targetType` | enum | `CONTRACTOR` `MATERIAL_STORE` |
| `rating` | int 1–5 | required |
| `comment` | string 0–1000 | |
| `images[]` | string URL | max 4, `uploads/reviews/{userId}/` |
| `createdAt` `updatedAt` | Date | no PATCH in 6.x |

**Indexes**

| Key | Type |
| --- | --- |
| `{ orderId: 1, customerId: 1, targetUserId: 1, targetType: 1 }` | **unique** |
| `{ targetUserId: 1, targetType: 1, createdAt: -1 }` | profile |
| `{ orderId: 1 }` | order page |

---

## 4. Rating calculation

**Contractor public score** lives on **`stores`** (already `rating`, `reviewCount` — marketplace cards). One store per contractor.

After each `CONTRACTOR` review insert:

```
reviews.find({ targetUserId: contractorId, targetType: 'CONTRACTOR' })
rating = round(avg, 1)
reviewCount = n
Store.updateOne({ contractorId }, { rating, reviewCount })
```

Optional additive copy on `contractorprofiles.rating` / `reviewCount` if the profile page should not join Store — **not required** if profile already reads store.

**Material store score:** `stores.materialRating` and `stores.materialReviewCount`, recomputed from `targetType = MATERIAL_STORE` only. Service ratings stay on `stores.rating`.

Recompute is **synchronous** in the review service (N is small). No nightly job in 6.1.

Seed placeholder ratings on stores remain until the first real review for that contractor; then they are **replaced** by the aggregate (not mixed with fake seed). Implementation: if `reviewCount` from reviews collection is 0, keep seed; else overwrite. Document in 6.1 seed notes.

---

## 5. API

### POST `/api/reviews`

**Auth:** CUSTOMER.  
**Request:**

```json
{
  "orderId": "...",
  "targetType": "CONTRACTOR",
  "targetUserId": "...",
  "rating": 5,
  "comment": "...",
  "images": []
}
```

Server verifies: the customer has accepted the finished work, and the target is the contractor or the material store on that order.

**Response:** Review public. Notify target `REVIEW_RECEIVED`. Audit `REVIEW_CREATED`.

### GET `/api/reviews/user/:id?targetType=`

Public (or auth). Returns `{ items, average, count }`.

### GET `/api/orders/:id/reviews`

**Auth:** party. List reviews for that order.

**No** PATCH/DELETE in Sprint 6.

---

## 6. Edge cases / anti-abuse

| Case | Rule |
| --- | --- |
| Review before COMPLETED | 409 |
| Duplicate same target | 409 unique index |
| Rating 0 or 6 | 422 |
| Review someone not on the order | 403 |
| Contractor posting as customer | 403 role |
| Spam (many photos) | max 4 images, existing upload mime/size |
| Fake reviews (sockpuppets) | Out of 6.x; ADMIN cannot insert reviews via public API. Optional admin hide = Sprint 7 |
| Edit after contractor replies | No replies in 6.x; immutable |

---

## 7. Security

Only the customer on that order creates reviews. The target must be `order.contractorId` or the owner of the order’s material store. Images go through existing upload middleware.
