# Layout revision — workshop, not lifestyle brochure

The updated design applies the Web Design plugin's redesign, form, responsive and hierarchy guidance to the existing working app.

## What changed

- The real booking calendar now sits in the opening section beside the brand message on desktop. On phones it immediately follows the introduction, before the service cards.
- Charcoal `#191919`, warm white `#f8f7f3` and orange `#f16535` establish a more direct motorcycle workshop identity. White-on-orange buttons use the darker `#bc3a10`; bright-orange buttons use dark text for readability.
- Bold system sans typography replaces the softer serif emphasis. Larger body text, labels and form controls improve readability and phone usability. No external font downloads.
- Service options form one continuous panel rather than four floating cards. The three-step process is a compact horizontal row on desktop and a vertical sequence on phones.
- Reminder signup remains a separate, optional task. Consent stays unchecked. Privacy, demo status and confirmation conditions remain visible.
- A mobile navigation button now reveals services, process, reminders and contact; it closes on selection or Escape and exposes its expanded state to assistive technology.
- Admin views share the new colors, larger controls and clearer type. Booking and consent backend logic is unchanged.

## Implementation

Structure: `public/index.html`. Visual system: `public/design-v2.css` layered after the original stylesheet. Menu behavior: `public/app.js`. The Node server serves the additional CSS; `node build.mjs` includes it in the static demonstration.

## Verification and publication state

The backend integration suite passed after the layout update. Browser checks verified the desktop layout, 375px phone viewport, menu open/close, no horizontal page overflow at that phone width, and completion of a fictional booking without reminder opt-in.

This revision is saved locally and included in the redesigned project archive. Publication could not proceed because the source repository network connection was blocked and this session does not allow the required network permission. The previously published private Site remains on its earlier design.

The separate `hanzelmoto-redesign-preview.html` is a portable, interactive sales preview. Open it in a browser; use invented data only. It stores demonstration data in localStorage, where the browser permits it, and does not send bookings or messages. Its illustrative photo requires internet access.
