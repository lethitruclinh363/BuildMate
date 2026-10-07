# Frontend performance after PostgreSQL

UI follow-up to `backend/docs/postgresql-performance-audit.md`. No new data library. Pages still call the existing axios helpers.

## Priority pages

| Page | Before | After |
| --- | --- | --- |
| `/store/dashboard` | One `GET /material-store/workspace` on mount. The bell separately loads notifications once per shell. Language does not refetch this page. | Same request count. The page does not blank itself while the name arrives. |
| `/store/materials`, `/store/products`, `/store/prices` | Same component mounted again on each path, so each tab repeated the load. The effect depended on `t`, and restoring the profile language changed `t`, so the first visit ran the chain twice. Each chain was `workspace`, then `getStore`, then materials and categories in parallel: 4 calls, 8 after the language restore. The first response replaced the page with a full skeleton. | The three paths share one mounted page. The effect runs once. Workspace already includes the store, so `getStore` is not called. Remaining calls: 1 workspace, then materials and categories together (3). Changing language does not refetch. The skeleton is only the first load. |
| `/customer/request/history` | One `GET /repair-requests/my` on mount. Retry set `loading` and replaced the list with a full-page skeleton. `item.images[0]` assumed the array always existed. | Still one request on mount. Retry keeps the error panel and spins the button. Missing `images` no longer throws. The thumbnail uses `loading="lazy"`. |

## Other UI changes

- Material order detail (customer and store) no longer polls every 15 seconds. The existing socket event still refreshes the open order.
- Explore no longer refetches materials and the service catalog on every radius or rating change. Nearby crews and stores still follow the map filters. A later filter keeps the previous cards instead of swapping the whole grid for a skeleton.
- Partner review status no longer restarts its refresh when the language function identity changes.
- Admin search loads the directory when the dialog opens, not again when the translation function changes. Typing filters the rows already loaded.
- Contractor workspace refresh no longer forces the services page back to a full skeleton. The services list reloads when the store id changes, not when the store object is a new reference.
- Accepting or declining a contractor request keeps the list on screen.
- Notifications request `page` and `limit` (40). The inbox can load the next page. Two components asking for the same page at the same time share one in-flight request.
- Chat loads at most 50 messages per room, which the API already supported.
- Small card and chat images use `loading="lazy"` and `decoding="async"`. There is no separate thumbnail service, so the file URL is unchanged.

## Not changed

Owner lists for materials, repair requests, and service orders still return that owner's rows as an array. Those endpoints do not take a page query. Notification and chat lists are the ones with a server limit.

Document ids from the profile API are still `_id` strings (the legacy id). Public order and request ids stay `id`.
