# ProgramLive Regression Checklist

After EACH future change, ensure these pass.

## STARTUP
- [ ] server starts
- [ ] Firebase initializes
- [ ] Telegram webhook config initializes
- [ ] no 409 Conflict
- [ ] no "Bot is not running" crash

## AUTH
- [ ] valid Telegram admin -> isAdmin=true
- [ ] viewer -> isAdmin=false
- [ ] fake userId cannot grant permissions

## PROGRAMS
- [ ] load program
- [ ] edit title
- [ ] add item
- [ ] edit item
- [ ] delete item
- [ ] reorder item

## LIVE
- [ ] Start Live
- [ ] Stop Live
- [ ] Next
- [ ] Prev
- [ ] activeItemId preserved after reorder

## REALTIME
- [ ] admin change appears for viewer
- [ ] viewer cannot write

## GROUP SHARE
- [ ] Add to group
- [ ] correct programId
- [ ] group saved as recipient
- [ ] program card appears

## PRIVATE SHARE
- [ ] inline share works
- [ ] recipient can open program
- [ ] 🔔 subscription works

## NOTIFICATIONS
- [ ] Live OFF change -> NO notification
- [ ] Start Live -> recipients receive start notification
- [ ] Live ON reorder -> debounce -> notification
- [ ] edit item -> notification
- [ ] Next / Prev -> NO notification

## RECIPIENT ISOLATION
- Program A -> Group A
- Program B -> Group B
- [ ] A notification does NOT reach B
- [ ] B notification does NOT reach A

## UPLOAD
- [ ] PDF upload works
- [ ] attachment opens/downloads
- [ ] retry does not break upload
