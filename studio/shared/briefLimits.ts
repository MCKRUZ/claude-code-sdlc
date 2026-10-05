// How many claims and attendees one brief can carry (spec 0032).
//
// The plugin sets no limit, but the build passes every claim and attendee on the command line as JSON, and
// an operating system caps a command line (about 32,000 characters on Windows). At the longest each may be
// (500 characters a claim, 200 each for an attendee's name and role) these caps stay well inside it, and
// they are far more than a one-page brief can use. Shared so the form that stops at them and the main
// process that refuses past them cannot disagree.

export const MAX_CLAIMS = 15
export const MAX_ATTENDEES = 30
