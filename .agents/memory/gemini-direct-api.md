---
name: Direct Gemini API behavior
description: Project-specific constraints when using a user-provided Gemini API key instead of Replit-managed AI.
---

Use the user's Gemini API key with the Google SDK when Replit-managed AI integration setup is unavailable or declined. Model access can vary by account: follow the provider's explicit model recommendation when a model is unavailable, and keep transient service overload visible with a retry path instead of silently switching models.

**Why:** Replit-managed AI setup was declined for this project, so the chat uses a user-provided Gemini key. The provider rejected an older model for new users and later returned a temporary high-demand 503.

**How to apply:** Keep the key server-side, never log or display it, and distinguish provider outages from application errors. Verify the currently configured model before changing it.
