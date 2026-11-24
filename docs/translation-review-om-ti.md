# Translation review: Afaan Oromoo and Tigrinya (F4e)

**Status: DRAFT.** Claude wrote these texts. A native speaker of each language must review them before any café uses that language (D-94).

## How to review

1. Read **Part 1** first: the short button words. A wrong word there can make a waiter do the wrong thing.
2. Then read **Part 2** (every text). The "Where" column says where the text appears in the app.
3. Write your correction in the "Correction" column (leave it empty if the text is right).
4. Keep every `{word in braces}` exactly as it is: the app puts a value there (a table name, a number).
5. Questions to answer as well:
   - Tigrinya: is the polite form (ሕተቱ, ናትኩም) right for staff, or should it be the familiar form?
   - Afaan Oromoo: is the familiar *ati* right for staff, or should it be the polite *isin*?
   - Tigrinya: should dish names show the Amharic name first (now) or the English one?
6. Send the corrections back; they come in as one small change to `app_om.arb` / `app_ti.arb`.

> This file is generated from `apps/tablet/lib/l10n/app_*.arb`. If the texts change, generate it again.

## Part 1: words that must never be confused

*Cancel item* (before the kitchen accepts, anyone) and *Void* (after the kitchen accepted, needs a manager PIN) are different actions. *Cancel* (close a dialog) is a third one.

| Key | Meaning in English | Where | Afaan Oromoo | Correction | Tigrinya | Correction |
|---|---|---|---|---|---|---|
| `lineActionCancel` | Cancel item | Line menu: cancel before the kitchen accepts. | Ajaja haqi |  | ትእዛዝ ሰርዝ |  |
| `lineActionVoid` | Void… | Line menu: void with a manager PIN. | Balleessi… |  | ደምስስ… |  |
| `voidButton` | Void item | Void dialog: confirm button. | Ajaja balleessi |  | ትእዛዝ ደምስስ |  |
| `commonCancel` | Cancel | Button: close a dialog without doing anything. | Dhiisi |  | ግደፎ |  |
| `commonUndo` | Undo | Button: take back the last tap (kitchen, removed order line). | Deebisi |  | ምለስ |  |
| `tableActionHandOver` | Hand over to… | Table menu (⋮): give the table to another waiter. | Tajaajilaa biraaf kenni… |  | ንካልእ ኣሳላፊ ሃብ… |  |
| `orderSoldOut` | Sold out | Order screen: shown instead of the price on a sold-out dish. | Dhumeera |  | ተወዲኡ |  |
| `kitchenAccept` | Accept | Kitchen: big button on a new item. | Fudhadhu |  | ተቐበል |  |
| `kitchenReady` | Ready | Kitchen: big button on an accepted item. | Qophaa'eera |  | ድሉው |  |
| `tableStateReady` | READY | Floor map: table card state (food ready to take). | QOPHAA'EERA |  | ድሉው |  |
| `lineActionDelivered` | Delivered | Line menu: mark the item delivered. | Geeffameera |  | በጺሑ |  |
| `orderSend` | Send to kitchen | Order screen: the main send button. | Kushinaatti ergi |  | ናብ ክሽነ ስደድ |  |
| `tableActionClose` | Close table | Table menu (⋮). | Minjaala cufi |  | ጣውላ ዕጸው |  |
| `lineActionDismiss` | Dismiss | Line menu: forget a refused round. | Irraanfadhu |  | ረስዖ |  |
| `tableRemove` | Remove | Table screen: confirm button for removing a round. | Baasi |  | ኣልዮ |  |

## Part 2: every text (141)

| Key | English | Where | Afaan Oromoo | Correction | Tigrinya | Correction |
|---|---|---|---|---|---|---|
| `appTitle` | Café | The app's name (Android task switcher). | Kaafee |  | ካፌ |  |
| `errorInvalidCode` | That code didn't work. Check it, or ask the manager for a new one. | Pairing screen: the 6-digit pairing code was wrong or expired. | Koodiin sun hin hojjenne. Ilaali, yookaan hoji-gaggeessaa koodii haaraa gaafadhu. |  | እቲ ኮድ ኣይሰርሐን። ኣረጋግጹ፡ ወይ ንኣመሓዳሪ ሓድሽ ኮድ ሕተቱ። |  |
| `errorRateLimited` | Too many wrong codes. Wait a while, or ask the manager. | Pairing screen: too many wrong pairing codes from this network. | Koodiin dogoggoraa baay'een galeera. Xiqqoo eegi, yookaan hoji-gaggeessaa gaafadhu. |  | ብዙሕ ጌጋ ኮዳት ኣትዩ። ቁሩብ ተጸበዩ፡ ወይ ንኣመሓዳሪ ሕተቱ። |  |
| `errorNetwork` | No connection to the server. Check the Wi-Fi. | Any screen: the server cannot be reached. | Sarvarii wajjin walqunnamtiin hin jiru. Wi-Fi ilaali. |  | ምስ ሰርቨር ርክብ የለን። ዋይፋይ ኣረጋግጹ። |  |
| `errorUnauthorizedDevice` | This tablet was removed by the manager. Pair it again. | Pairing screen: the manager revoked this tablet in the dashboard. | Taabileetiin kun hoji-gaggeessaan haqameera. Irra deebi'ii walqabsiisi. |  | እዚ ታብሌት ብኣመሓዳሪ ተኣልዩ እዩ። እንደገና ኣራኽብዎ። |  |
| `errorInvalidCredentials` | Wrong PIN. Try again. | PIN screen: the waiter typed a wrong PIN. | PIN dogoggoraa. Irra deebi'ii yaali. |  | ጌጋ ፒን። እንደገና ፈትኑ። |  |
| `errorLocked` | Locked for {minutes} minutes after too many wrong PINs. | PIN screen: sign-in locked after 5 wrong PINs. | PIN dogoggoraa baay'ee waan galeef daqiiqaa {minutes}f cufameera. |  | ብዙሕ ጌጋ ፒን ስለ ዝኣተወ ን{minutes} ደቒቕ ተዓጽዩ። |  |
| `errorSessionEnded` | You were signed out (the manager ended it, or the shift session expired). Sign in again. | PIN screen: the waiter's sign-in ended. | Sirna keessaa baafamteetta (hoji-gaggeessaan dhaabeera, yookaan yeroon hojii xumurameera). Irra deebi'ii seeni. |  | ካብ ሲስተም ወጺእኩም ኢኹም (ኣመሓዳሪ ኣቋሪጽዎ፡ ወይ ግዜ ፈረቓ ተወዲኡ)። እንደገና እተዉ። |  |
| `errorTableAlreadyOpen` | Someone else just opened this table. | Floor map: two waiters opened the same table at once. | Namni biraa amma minjaala kana baneera. |  | ካልእ ሰብ ነዚ ጣውላ ሕጂ ከፊትዎ። |  |
| `errorUnsentRounds` | Some orders have not reached the kitchen yet. Wait for the connection before signing out. | Floor map: sign-out is blocked while orders wait offline. | Ajajni tokko tokko ammallee kushinaa hin geenye. Osoo hin ba'in dura hanga walqunnamtiin deebi'utti eegi. |  | ገለ ትእዛዛት ገና ናብ ክሽነ ኣይበጽሑን። ቅድሚ ምውጻእኩም ርክብ ክሳብ ዝምለስ ተጸበዩ። |  |
| `errorNotAWaiterDevice` | This is a kitchen tablet: nobody signs in on it. | PIN screen: someone tried to sign in on a kitchen tablet. | Kun taabileetii kushinaati: namni tokkollee itti hin seenu. |  | እዚ ታብሌት ክሽነ እዩ፡ ዝኾነ ሰብ ኣብኡ ኣይኣቱን። |  |
| `errorNeedsConnection` | Needs internet: this cannot wait offline. Try again when the connection is back. | Table actions (close, move, void...) tapped while offline. | Interneetii barbaada: kun osoo walqunnamtiin hin jiraatin eeguu hin danda'u. Yeroo walqunnamtiin deebi'u irra deebi'ii yaali. |  | ኢንተርነት የድሊ፡ እዚ ብዘይ ርክብ ክጽበ ኣይክእልን። ርክብ ምስ ተመልሰ እንደገና ፈትኑ። |  |
| `errorNoAnswer` | No answer from the server. Check the table: it may have worked. If not, try again. | Any action: the server did not answer in time. | Sarvariin deebii hin kennine. Minjaala ilaali: hojjetee ta'uu danda'a. Yoo hin hojjenne, irra deebi'ii yaali. |  | ካብ ሰርቨር መልሲ የለን። ነቲ ጣውላ ርኣዩ፡ ሰሪሑ ክኸውን ይኽእል። እንተዘይሰሪሑ እንደገና ፈትኑ። |  |
| `errorNeedsManagerVoid` | The kitchen already accepted it. Ask a manager to void it. | Table screen: cancel tapped after the kitchen accepted the item. | Kushinaan duraan fudhateera. Akka balleessuuf hoji-gaggeessaa gaafadhu. |  | ክሽነ ድሮ ተቐቢልዎ። ንኣመሓዳሪ ክድምስሶ ሕተቱ። |  |
| `errorNotAllowedFromState` | Not possible any more: the item changed. Look at its state now. | Any item action: the item's state changed meanwhile. | Amma hin danda'amu: ajajni jijjiirameera. Haala isaa amma ilaali. |  | ሕጂ ኣይከኣልን፡ እቲ ትእዛዝ ተቐይሩ። ኩነታቱ ሕጂ ርኣዩ። |  |
| `errorItemsNotFinished` | Some items are not finished yet. Mark them delivered, cancelled or voided first. | Table screen: closing a table that still has open items. | Ajajni tokko tokko ammallee hin xumuramne. Dursa geeffameera, haqameera yookaan balleeffameera jedhii mallatteessi. |  | ገለ ትእዛዛት ገና ኣይተወድኡን። ቅድም በጺሑ፡ ተሰሪዙ ወይ ተደምሲሱ ኢልኩም ምልክት ግበሩ። |  |
| `errorNotYourTable` | This table belongs to another waiter. | Table screen: acting on another waiter's table. | Minjaalli kun kan tajaajilaa biraati. |  | እዚ ጣውላ ናይ ካልእ ኣሳላፊ እዩ። |  |
| `errorSessionClosed` | This table was already closed. | Table screen: the table visit is already closed. | Minjaalli kun duraan cufameera. |  | እዚ ጣውላ ድሮ ተዓጽዩ እዩ። |  |
| `errorSessionNotFound` | The server does not know this table visit yet. Wait a moment and try again. | Table screen: the table was opened offline and has not reached the server yet. | Sarvariin banamuu minjaala kanaa ammallee hin beeku. Xiqqoo eegii irra deebi'ii yaali. |  | ሰርቨር ነዚ ምኽፋት ጣውላ ገና ኣይፈልጦን። ቁሩብ ተጸቢኹም እንደገና ፈትኑ። |  |
| `errorTableNotFound` | That table no longer exists. | Move/merge: the target table was removed. | Minjaalli sun kana booda hin jiru. |  | እቲ ጣውላ ደጊም የለን። |  |
| `errorStaffNotFound` | That waiter is not active any more. | Hand-over: the chosen waiter was deactivated. | Tajaajilaan sun kana booda hojii irra hin jiru. |  | እቲ ኣሳላፊ ደጊም ኣብ ስራሕ የለን። |  |
| `errorManagerPinInvalid` | Wrong manager PIN. Try again. | Void dialog: the manager typed a wrong PIN. | PIN hoji-gaggeessaa dogoggoraa. Irra deebi'ii yaali. |  | ጌጋ ፒን ኣመሓዳሪ። እንደገና ፈትኑ። |  |
| `errorManagerApprovalRequired` | A manager must approve this. | Void dialog: a waiter tried to void without a manager PIN. | Hoji-gaggeessaan kana mirkaneessuu qaba. |  | ኣመሓዳሪ ከጽድቖ ኣለዎ። |  |
| `errorManagerLocked` | Manager PIN locked for {minutes} minutes after too many wrong tries. | Void dialog: the manager's PIN is locked after wrong tries. | Yaaliin dogoggoraa baay'ee waan ta'eef PIN hoji-gaggeessaa daqiiqaa {minutes}f cufameera. |  | ብዙሕ ጌጋ ፈተነ ስለ ዝነበረ ፒን ኣመሓዳሪ ን{minutes} ደቒቕ ተዓጽዩ። |  |
| `errorVoidNeedsReason` | Write why the item is voided. | Void dialog: the reason is empty. | Maaliif akka balleeffamu barreessi. |  | እቲ ትእዛዝ ስለምንታይ ከም ዝድምሰስ ጸሓፉ። |  |
| `errorUndoExpired` | Too late to undo (more than 10 seconds). | Kitchen: Undo tapped after 10 seconds. | Deebisuuf turfameera (sekondii 10 caala). |  | ንምምላስ ደንጉዩ (ካብ 10 ካልኢት ንላዕሊ)። |  |
| `errorNothingToUndo` | Nothing to undo on this item any more. | Kitchen: Undo tapped but there is nothing to undo. | Ajaja kana irratti wanti deebifamu hin jiru. |  | ኣብዚ ትእዛዝ ዝምለስ ነገር የለን። |  |
| `errorWrongStation` | This item belongs to another station. | Kitchen: the item belongs to the bar (or the other way round). | Ajajni kun kan iddoo qophii biraati. |  | እዚ ትእዛዝ ናይ ካልእ መዳለዊ ቦታ እዩ። |  |
| `errorItemNotFound` | The server does not know this item. | Kitchen or table: the item is unknown to the server. | Sarvariin ajaja kana hin beeku. |  | ሰርቨር ነዚ ትእዛዝ ኣይፈልጦን። |  |
| `errorMenuItemNotFound` | This item is no longer on the menu. | Sold-out list: the menu item was removed. | Kun kana booda menuu irra hin jiru. |  | እዚ ደጊም ኣብ ሜኑ የለን። |  |
| `errorUnknown` | Something went wrong ({code}). Try again. | Any screen: an error code the app does not know; {code} helps support. | Wanti tokko dogoggoreera ({code}). Irra deebi'ii yaali. |  | ገለ ጌጋ ተፈጢሩ ({code})። እንደገና ፈትኑ። |  |
| `stationKitchen` | Kitchen | Name of the kitchen station (kitchen screen title). | Kushinaa |  | ክሽነ |  |
| `stationBar` | Bar | Name of the bar station (bar screen title). | Baarii |  | ባር |  |
| `appError` | Something went wrong. Restart the app. | Whole screen: the app could not start. | Wanti tokko dogoggoreera. Appicha irra deebi'ii jalqabi. |  | ገለ ጌጋ ተፈጢሩ። ነቲ ኣፕ እንደገና ጀምሩ። |  |
| `commonCancel` | Cancel | Button: close a dialog without doing anything. | Dhiisi |  | ግደፎ |  |
| `commonBack` | Back | Button: leave a dialog without doing anything. | Deebi'i |  | ተመለስ |  |
| `commonUndo` | Undo | Button: take back the last tap (kitchen, removed order line). | Deebisi |  | ምለስ |  |
| `commonRound` | Round {round} | Heading: the Nth round of orders at a table (table screen, kitchen ticket). | Marsaa {round} |  | ዙር {round} |  |
| `pairTitle` | Pair this tablet | Pairing screen title (first start). | Taabileetii kana walqabsiisi |  | ነዚ ታብሌት ኣራኽብ |  |
| `pairHelp` | Ask the manager to add it in the dashboard, then type the 6-digit code. | Pairing screen: how to get a pairing code. | Hoji-gaggeessaan daashboordii irratti akka itti dabalu gaafadhu, achiin koodii lakkoofsa 6 qabu barreessi. |  | ኣመሓዳሪ ኣብ ዳሽቦርድ ክውስኾ ሕተቱ፡ ድሕሪኡ ባለ 6 ኣሃዝ ኮድ ጸሓፉ። |  |
| `pairButton` | Pair | Pairing screen button. | Walqabsiisi |  | ኣራኽብ |  |
| `pinTitle` | Who are you? | PIN screen title above the staff names. | Ati eenyu? |  | መን ኢኹም? |  |
| `pinLabel` | PIN | PIN screen: label of the PIN field. | PIN |  | ፒን |  |
| `pinSignIn` | Sign in | PIN screen button. | Seeni |  | እቶ |  |
| `pinNotYou` | Not you? Choose another name | PIN screen: go back to the list of names. | Ati miti? Maqaa biraa filadhu |  | ንስኹም ኣይኮንኩምን? ካልእ ስም ምረጹ |  |
| `floorDefaultArea` | Tables | Floor map: heading for tables without an area. | Minjaalota |  | ጣውላታት |  |
| `floorMine` | Mine | Floor map: filter showing only my tables, and the label on my table cards. | Kan koo |  | ናተይ |  |
| `floorSignOut` | Sign out | Floor map: sign-out button tooltip. | Ba'i |  | ውጻእ |  |
| `floorAnotherWaiter` | another waiter | Floor map: used in floorTableOfOther when the waiter's name is unknown. | tajaajilaa biraa |  | ካልእ ኣሳላፊ |  |
| `floorTableOfOther` | {table} is {holder}'s table. | Floor map: tapped another waiter's table. | {table} minjaala {holder} ti. |  | {table} ናይ {holder} ጣውላ እዩ። |  |
| `floorOpenTitle` | Open {table} | Floor map: title of the dialog that opens a table. | {table} bani |  | {table} ክፈት |  |
| `floorGuests` | Guests (optional) | Open-table dialog: number of guests. | Keessummoota (filannoo) |  | ኣጋይሽ (ኣማራጺ) |  |
| `floorOpenButton` | Open table | Open-table dialog button. | Minjaala bani |  | ጣውላ ክፈት |  |
| `floorSending` | Sending {count} waiting order(s)… | Floor map banner: back online, sending queued orders. | Ajaja eegaa jiru {count} ergaa jira… |  | {count} ዝጽበዩ ትእዛዛት ይለኣኹ ኣለዉ… |  |
| `floorOffline` | Waiting for internet. Orders are kept on this tablet and sent automatically. | Floor map banner: offline, nothing waiting. | Interneetii eegaa jira. Ajajni taabileetii kana irratti kuufamee ofumaan ergama. |  | ኢንተርነት ይጽበ ኣሎ። ትእዛዛት ኣብዚ ታብሌት ይዕቀቡን ባዕሎም ይለኣኹን። |  |
| `floorOfflineWaiting` | Waiting for internet. Orders are kept on this tablet and sent automatically. ({count} waiting) | Floor map banner: offline, with orders waiting. | Interneetii eegaa jira. Ajajni taabileetii kana irratti kuufamee ofumaan ergama. ({count} eegaa jira) |  | ኢንተርነት ይጽበ ኣሎ። ትእዛዛት ኣብዚ ታብሌት ይዕቀቡን ባዕሎም ይለኣኹን። ({count} ይጽበዩ ኣለዉ) |  |
| `tableStateFree` | Free | Floor map: table card state. | Duwwaa |  | ባዶ |  |
| `tableStateSeated` | Seated | Floor map: table card state (guests seated, nothing ordered). | Taa'aniiru |  | ተቐሚጦም |  |
| `tableStateOrdered` | Ordered | Floor map: table card state. | Ajajameera |  | ተኣዚዙ |  |
| `tableStateAccepted` | Accepted | Floor map: table card state (kitchen accepted). | Fudhatameera |  | ተቐቢሉ |  |
| `tableStateReady` | READY | Floor map: table card state (food ready to take). | QOPHAA'EERA |  | ድሉው |  |
| `tableStateDelivered` | Delivered | Floor map: table card state. | Geeffameera |  | በጺሑ |  |
| `orderNotAdded` | Not added (sold out or changed): {items} | Order screen: 'order again' skipped some dishes. | Hin dabalamne (dhumeera yookaan jijjiirameera): {items} |  | ኣይተወሰኹን (ተወዲኦም ወይ ተቐይሮም): {items} |  |
| `orderSearch` | Search the menu | Order screen: search box hint. | Menuu keessa barbaadi |  | ኣብ ሜኑ ድለዩ |  |
| `orderFavourites` | Favourites | Order screen: tab with favourite dishes. | Filatamoo |  | ዝተፈተዉ |  |
| `orderSoldOut` | Sold out | Order screen: shown instead of the price on a sold-out dish. | Dhumeera |  | ተወዲኡ |  |
| `orderOneLess` | One less | Order summary: minus button tooltip. | Tokko hir'isi |  | ሓደ ኣጉድል |  |
| `orderOneMore` | One more | Order summary: plus button tooltip. | Tokko dabali |  | ሓደ ወስኽ |  |
| `orderTotal` | Total {amount} ETB | Order summary: total price. | Waliigala {amount} Qarshii |  | ድምር {amount} ብር |  |
| `orderSend` | Send to kitchen | Order screen: the main send button. | Kushinaatti ergi |  | ናብ ክሽነ ስደድ |  |
| `orderRemoved` | {item} removed | Order screen: a line was removed (with Undo). | {item} baafameera |  | {item} ተኣልዩ |  |
| `orderTableNotOpen` | This table is not open. | Order screen: send tapped but the table was closed. | Minjaalli kun hin banamne. |  | እዚ ጣውላ ክፉት ኣይኮነን። |  |
| `orderRequired` | {group} (required) | Option dialog: a group the waiter must choose from, e.g. Size. | {group} (dirqama) |  | {group} (ግዴታ) |  |
| `orderNote` | Note (optional) | Option dialog: free-text note for the kitchen. | Yaadannoo (filannoo) |  | መዘኻኸሪ (ኣማራጺ) |  |
| `orderChoose` | Choose: {groups} | Option dialog: required groups still missing. | Filadhu: {groups} |  | ምረጹ: {groups} |  |
| `orderAdd` | Add | Option dialog: add the dish to the order. | Dabali |  | ወስኽ |  |
| `lineStateSent` | Sent ✓ | Table screen: line state, the server has it. | Ergameera ✓ |  | ተላኢኹ ✓ |  |
| `lineStateAccepted` | Accepted | Table screen: line state, kitchen accepted. | Fudhatameera |  | ተቐቢሉ |  |
| `lineStateReady` | READY | Table screen: line state, ready to take. | QOPHAA'EERA |  | ድሉው |  |
| `lineStateDelivered` | Delivered | Table screen: line state. | Geeffameera |  | በጺሑ |  |
| `lineStateCancelled` | Cancelled | Table screen: line state (cancelled before the kitchen accepted). | Haqameera |  | ተሰሪዙ |  |
| `lineStateVoided` | Voided | Table screen: line state (voided by a manager). | Balleeffameera |  | ተደምሲሱ |  |
| `lineWaitingInternet` | Waiting for internet | Table screen: a round queued offline. | Interneetii eegaa jira |  | ኢንተርነት ይጽበ ኣሎ |  |
| `lineSending` | Sending… | Table screen: a round on its way. | Ergaa jira… |  | ይለኣኽ ኣሎ… |  |
| `lineNotSent` | Not sent: {reason} | Table screen: the server refused a round; {reason} is an error sentence. | Hin ergamne: {reason} |  | ኣይተላእከን: {reason} |  |
| `tableNothingOrdered` | Nothing ordered yet. | Table screen: empty table. | Ammallee wanti ajajame hin jiru. |  | ገና ዝተኣዘዘ የለን። |  |
| `tableNewRound` | New round | Table screen: heading of a round not yet confirmed. | Marsaa haaraa |  | ሓድሽ ዙር |  |
| `tableAddItems` | Add items | Table screen: button that opens the menu. | Ajaja dabali |  | ትእዛዝ ወስኽ |  |
| `tableRemoveRoundTitle` | Remove this round? | Table screen: confirm removing a refused round. | Marsaa kana haa baasu? |  | እዚ ዙር ይእለ? |  |
| `tableRemoveRoundBody` | It never reached the kitchen. Its items will be removed from this table. | Table screen: confirm removing a refused round. | Gonkumaa kushinaa hin geenye. Ajajni isaa minjaala kana irraa ni baafama. |  | ናብ ክሽነ ፈጺሙ ኣይበጽሐን። ትእዛዛቱ ካብዚ ጣውላ ክእለዩ እዮም። |  |
| `tableRemove` | Remove | Table screen: confirm button for removing a round. | Baasi |  | ኣልዮ |  |
| `tableMoveTo` | Move {table} to | Table screen: title of the list of free tables. | {table} eessatti haa jijjiiramu? |  | {table} ናበይ ይግዕዝ? |  |
| `tableMergeInto` | Merge {table} into | Table screen: title of the list of open tables. | {table} minjaala kamitti haa makamu? |  | {table} ምስ ኣየናይ ጣውላ ይጽንበር? |  |
| `tableHandOverTo` | Hand {table} over to | Table screen: title of the list of waiters. | {table} eenyuuf haa kennamu? |  | {table} ንመን ይወሃብ? |  |
| `tableCloseTitle` | Close {table}? | Table screen: confirm closing the table. | {table} haa cufamu? |  | {table} ይዕጸው? |  |
| `tableCloseBody` | The table becomes free for the next guests. | Table screen: confirm closing the table. | Minjaalli keessummoota itti aananiif duwwaa ta'a. |  | እቲ ጣውላ ንዝቕጽሉ ኣጋይሽ ባዶ ይኸውን። |  |
| `tableClose` | Close | Table screen: confirm button for closing. | Cufi |  | ዕጸው |  |
| `tableNoneAvailable` | None available right now. | Table screen: empty list of tables or waiters. | Amma homtuu hin jiru. |  | ሕጂ ዝኾነ የለን። |  |
| `lineActionDelivered` | Delivered | Line menu: mark the item delivered. | Geeffameera |  | በጺሑ |  |
| `lineActionCancel` | Cancel item | Line menu: cancel before the kitchen accepts. | Ajaja haqi |  | ትእዛዝ ሰርዝ |  |
| `lineActionVoid` | Void… | Line menu: void with a manager PIN. | Balleessi… |  | ደምስስ… |  |
| `lineActionOrderAgain` | Order again | Line menu: send a refused round again. | Irra deebi'ii ajaji |  | እንደገና እዘዝ |  |
| `lineActionDismiss` | Dismiss | Line menu: forget a refused round. | Irraanfadhu |  | ረስዖ |  |
| `tableActionMove` | Move to another table | Table menu (⋮). | Gara minjaala biraatti jijjiiri |  | ናብ ካልእ ጣውላ ኣግዕዝ |  |
| `tableActionMerge` | Merge into another table | Table menu (⋮). | Minjaala biraa wajjin maki |  | ምስ ካልእ ጣውላ ኣጽንብር |  |
| `tableActionHandOver` | Hand over to… | Table menu (⋮): give the table to another waiter. | Tajaajilaa biraaf kenni… |  | ንካልእ ኣሳላፊ ሃብ… |  |
| `tableActionClose` | Close table | Table menu (⋮). | Minjaala cufi |  | ጣውላ ዕጸው |  |
| `voidTitle` | Void {item} | Void dialog title. | {item} balleessi |  | {item} ደምስስ |  |
| `voidReason` | Reason (e.g. customer left, wrong item) | Void dialog: reason field. | Sababa (fkn. maamilli deeme, ajaja dogoggoraa) |  | ምኽንያት (ንኣብነት ዓሚል ከይዱ፡ ጌጋ ትእዛዝ) |  |
| `voidManager` | Manager | Void dialog: heading above the manager names. | Hoji-gaggeessaa |  | ኣመሓዳሪ |  |
| `voidNoManager` | No manager found. Connect to the internet and try again. | Void dialog: no manager names downloaded. | Hoji-gaggeessaan hin argamne. Interneetiitti walqabadhuu irra deebi'ii yaali. |  | ኣመሓዳሪ ኣይተረኽበን። ምስ ኢንተርነት ተራኺብኩም እንደገና ፈትኑ። |  |
| `voidManagerPin` | Manager's 6-digit PIN | Void dialog: PIN field. | PIN hoji-gaggeessaa (lakkoofsa 6) |  | ባለ 6 ኣሃዝ ፒን ኣመሓዳሪ |  |
| `voidButton` | Void item | Void dialog: confirm button. | Ajaja balleessi |  | ትእዛዝ ደምስስ |  |
| `kitchenSoldOutButton` | Sold out | Kitchen app bar: opens the sold-out list. | Dhumeera |  | ተወዲኡ |  |
| `kitchenNoOrders` | No orders. New orders appear here by themselves. | Kitchen: empty screen. | Ajajni hin jiru. Ajajni haaraan ofumaan as mul'ata. |  | ትእዛዝ የለን። ሓደሽቲ ትእዛዛት ባዕሎም ኣብዚ ይርኣዩ። |  |
| `kitchenSentOffline` | Sent while offline: it may already be made. Ask the waiter. | Kitchen ticket: the round waited on the waiter's phone. | Osoo interneetiin hin jiraatin ergame: duraan qophaa'ee ta'uu danda'a. Tajaajilaa gaafadhu. |  | ብዘይ ኢንተርነት እዩ ተላኢኹ፡ ድሮ ተሰሪሑ ክኸውን ይኽእል። ንኣሳላፊ ሕተቱ። |  |
| `kitchenAgeOver99` | 99+ min | Kitchen ticket: age, capped. | daq. 99+ |  | 99+ ደቒቕ |  |
| `kitchenAgeMinutes` | {minutes} min | Kitchen ticket: how long ago the round arrived. | daq. {minutes} |  | {minutes} ደቒቕ |  |
| `kitchenFlagSoldOut` | SOLD OUT when ordered | Kitchen ticket line: the dish was sold out when the order arrived. | YEROO AJAJAMETTI DHUMEERA |  | ክእዘዝ ከሎ ተወዲኡ ነይሩ |  |
| `kitchenFlagUnavailable` | NOT ON THE MENU any more | Kitchen ticket line: the dish was removed from the menu. | KANA BOODA MENUU IRRA HIN JIRU |  | ደጊም ኣብ ሜኑ የለን |  |
| `kitchenAccept` | Accept | Kitchen: big button on a new item. | Fudhadhu |  | ተቐበል |  |
| `kitchenReady` | Ready | Kitchen: big button on an accepted item. | Qophaa'eera |  | ድሉው |  |
| `kitchenWaitingPickup` | Waiting for pickup | Kitchen: item is ready, the waiter has not taken it. | Fudhatamuuf eegaa jira |  | ክውሰድ ይጽበ ኣሎ |  |
| `kitchenDelivered` | Delivered | Kitchen: item delivered to the table. | Geeffameera |  | በጺሑ |  |
| `kitchenCancelled` | CANCELLED | Kitchen: item cancelled by the waiter. | HAQAMEERA |  | ተሰሪዙ |  |
| `kitchenVoided` | VOIDED | Kitchen: item voided by a manager. | BALLEEFFAMEERA |  | ተደምሲሱ |  |
| `kitchenNoConnection` | No connection: new orders cannot arrive. Talk to the waiters directly. | Kitchen: red bar when offline. | Walqunnamtiin hin jiru: ajajni haaraan dhufuu hin danda'u. Tajaajiltoota kallattiin dubbisi. |  | ርክብ የለን፡ ሓደሽቲ ትእዛዛት ክመጹ ኣይክእሉን። ምስ ኣሳለፍቲ ብቐጥታ ተዛረቡ። |  |
| `soldOutTitle` | Sold out: {station} | Sold-out list title. | Dhumeera: {station} |  | ዝተወድኡ: {station} |  |
| `soldOutLabel` | SOLD OUT | Sold-out list: under a dish that is sold out. | DHUMEERA |  | ተወዲኡ |  |
| `alertReady` | {table} — ready: {what} | Waiter alert (loud): a dish is ready. {what} is like '2× Tibs (ጥብስ)'. | {table} — qophaa'eera: {what} |  | {table} — ድሉው: {what} |  |
| `alertAccepted` | {table} — kitchen accepted: {what} | Waiter alert (soft): the kitchen accepted a dish. | {table} — kushinaan fudhateera: {what} |  | {table} — ክሽነ ተቐቢሉ: {what} |  |
| `alertNotReadyYet` | {table} — not ready yet: {what} | Waiter alert: the kitchen undid 'ready'. | {table} — ammallee hin qophoofne: {what} |  | {table} — ገና ድሉው ኣይኮነን: {what} |  |
| `alertNotAcceptedYet` | {table} — not accepted yet: {what} | Waiter alert: the kitchen undid 'accepted'. | {table} — ammallee hin fudhatamne: {what} |  | {table} — ገና ኣይተቐበለን: {what} |  |
| `alertStillWaiting` | {table} — still waiting: {what} | Waiter alert (loud): reminder 2 minutes after 'ready'. | {table} — ammallee eegaa jira: {what} |  | {table} — ገና ይጽበ ኣሎ: {what} |  |
| `alertTableYours` | {table} is now yours | Waiter alert: another waiter handed this table over. | {table} amma kan keeti |  | {table} ሕጂ ናትኩም እዩ |  |
| `alertTableYoursFrom` | {table} is now yours (from {from}) | Waiter alert: a table handed over, with who gave it. | {table} amma kan keeti ({from} irraa) |  | {table} ሕጂ ናትኩም እዩ (ካብ {from}) |  |
| `keepAliveTitle` | Café: alerts are on | Android notification title while the waiter is signed in. | Kaafee: beeksisni banaa dha |  | ካፌ: መጠንቀቕታታት ክፉታት እዮም |  |
| `keepAliveIdle` | Keep the app open in the background. Do not swipe it away. | Android notification text when there is no new alert. | Appicha duubaan banaa dhiisi. Hin cufiin. |  | ነቲ ኣፕ ኣብ ድሕሪት ክፉት ግደፍዎ። ኣይትዕጸውዎ። |  |
| `keepAliveChannelName` | Café alerts | Android settings: name of the notification channel. | Beeksisa Kaafee |  | መጠንቀቕታታት ካፌ |  |
| `keepAliveChannelDescription` | Shows that Ready alerts are on, and the latest alert. | Android settings: description of the notification channel. | Beeksisni qophaa'uu banaa ta'uu fi beeksisa dhumaa agarsiisa. |  | መጠንቀቕታ ድሉው ክፉት ምዃኑን እቲ ናይ መወዳእታ መጠንቀቕታን የርኢ። |  |
| `languageSwitch` | Switch language | Tooltip of the language button (shows the current language, opens the list of all four) on the floor map and kitchen screen. | Afaan jijjiiri |  | ቋንቋ ቀይር |  |
