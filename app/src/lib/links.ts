// Links the app points people to. Kept in one place so they're easy to change.

/**
 * A Google Sheet with the sync script already inside, shared as a "Make a copy" link
 * (https://docs.google.com/spreadsheets/d/<id>/copy). Leave empty to hide the button.
 */
export const SHEET_TEMPLATE_URL: string = '';

/** The project's home: source code, and where to ask for help or report a problem. */
export const REPO_URL: string = 'https://github.com/AlexisDrain/Recommendation-Journal';

/** The step-by-step setup guide for Google Sheet sync. */
export const SHEET_GUIDE_URL: string = `${REPO_URL}/blob/main/google-sheets/README.md`;
