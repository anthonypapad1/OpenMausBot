/** How much larger than 100% the main window opens (main.mjs's webPreferences.zoomFactor). Corso reads a step larger
 * than the app it forks: its people are agents and coordinators reading between showings, not developers.
 * View > Actual Size still goes back to 100%; the rail undoes it in preload.cjs. */
export const CORSO_ZOOM = 1.15;
