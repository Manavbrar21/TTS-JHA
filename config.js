/* ==========================================================
   TTS Field JHA — settings
   Fill these in once after setting up the office backend
   (see README.md, "Step 1"). Then re-upload the app.
   ========================================================== */
self.JHA_CONFIG = {
  /* The Google Apps Script "Web app" URL from Step 1.
     Leave empty and forms are still saved on the phone,
     they just wait until this is filled in. */
  ENDPOINT: "https://script.google.com/macros/s/AKfycbxo35GqH_ZXx4YjS_hk03Np5fmbUQJVn_aFgfyXNNoyiiRyapWmzWaY_paFZcLVw_Vv/exec",

  /* Must match TOKEN in backend/Code.gs exactly. */
  TOKEN: "NOKIA,21",

  COMPANY: "Total Transload Services (2015) Inc.",
  FORM_REV: "Rev. 2026-10-09",

  /* Sent forms older than this are removed from the phone
     (the office copy in Drive / email is kept forever). */
  KEEP_SENT_DAYS: 60
};
