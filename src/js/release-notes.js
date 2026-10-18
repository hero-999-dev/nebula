/**
 * What each release changed, in the words of someone using the app.
 *
 * This is shown once per version, in the middle of the screen, the first time
 * a build runs — an update that arrives silently gives no reason to look for
 * what it fixed, and the reports that drive this project are written by
 * someone who has to notice.
 *
 * Keep the lines short and about what the reader can now DO. No version
 * numbers inside the text, no internals: "a code block can be deleted with
 * Backspace", not "codeBlockIn walks outward".
 *
 * A version with no entry here simply shows nothing.
 */
export const RELEASE_NOTES = {
  '0.9.9': {
    headline: 'Black holes ask clearly before deleting and stay responsive with large files.',
    items: [
      { title: 'Delete for good?', text: 'Every note in the Trash asks for a second press before permanent deletion. A note from a black hole is labelled there, and deleting a black hole asks for its PIN or passkey and a final confirmation.' },
      { title: 'Keys you control', text: 'Change a black hole PIN only after proving the current PIN or passkey. An open black hole can make a new recovery key from its menu; the old key stops working and the new one is shown once.' },
      { title: 'Large files', text: 'Deleting a large note or video, clearing an opened copy and opening a black hole leave the window responsive while the work finishes.' },
      { title: 'Protected names', text: 'A black hole name is protected in its local metadata and backups. Moving a note into a black hole waits until its encrypted copy is saved and the old plain copies are removed. To take it back out, choose Move to notes from the note menu.' },
    ],
  },
  '0.9.8': {
    headline: 'Black holes ask clearly before deleting and stay responsive with large files.',
    items: [
      { title: 'Delete for good?', text: 'Every note in the Trash asks for a second press before permanent deletion. A note from a black hole is labelled there, and deleting a black hole asks for its PIN or passkey and a final confirmation.' },
      { title: 'Keys you control', text: 'Change a black hole PIN only after proving the current PIN or passkey. An open black hole can make a new recovery key from its menu; the old key stops working and the new one is shown once.' },
      { title: 'Large files', text: 'Deleting a large note or video, clearing an opened copy and opening a black hole leave the window responsive while the work finishes.' },
      { title: 'Protected names', text: 'A black hole name is protected in its local metadata and backups. Moving a note into a black hole waits until its encrypted copy is saved and the old plain copies are removed. To take it back out, choose Move to notes from the note menu.' },
    ],
  },
  '0.9.7': {
    headline: 'Black holes ask clearly before deleting and stay responsive with large files.',
    items: [
      { title: 'Delete for good?', text: 'Every note in the Trash asks for a second press before permanent deletion. A note from a black hole is labelled there, and deleting a black hole asks for its PIN or passkey and a final confirmation.' },
      { title: 'Keys you control', text: 'Change a black hole PIN only after proving the current PIN or passkey. An open black hole can make a new recovery key from its menu; the old key stops working and the new one is shown once.' },
      { title: 'Large files', text: 'Deleting a large note or video, clearing an opened copy and opening a black hole leave the window responsive while the work finishes.' },
      { title: 'Protected names', text: 'A black hole name is protected in its local metadata and backups. Moving a note into a black hole waits until its encrypted copy is saved and the old plain copies are removed. To take it back out, choose Move to notes from the note menu.' },
    ],
  },
  '0.9.6': {
    headline: 'Files in a note, a page that asks first, and a safer app.',
    items: [
      { title: 'Files in a note', text: 'Drag any file onto a note, or type /file: it is kept in the note as a card with its name, its kind and its size. A click saves a copy wherever you like; Open hands it to the program your computer has for it. A program or a script asks before it runs, and a copy that leaves Nebula is marked as downloaded, as a browser would.' },
      { title: 'A page in a note asks first', text: 'An embedded page that wants your microphone, your camera or notifications asks you, with Don’t allow already chosen. The answer is never kept: the next time the page opens, it asks again. The guide has a section on it.' },
      { title: 'Safer', text: 'A link in a note can no longer take the app’s window away to a web page, an embedded page can no longer open windows by itself or read what you copied, and Lock Nebula takes a file opened from a black hole and a PDF preview with it.' },
      { title: 'Finding things', text: 'Find, the search box and every list you type into find İstanbul however the I is typed, a match inside a folded toggle opens it, and a code block’s language no longer counts as a match.' },
      { title: 'Small things', text: 'Save and open windows speak your language, a name cut to length never cuts an emoji in half, and a card can be picked, removed and opened from the keyboard.' },
    ],
  },
  '0.9.5': {
    headline: 'A caption stays with its picture, and the taskbar wears your logo.',
    items: [
      { title: 'Captions', text: 'A highlight or a colour given to the words of a picture’s caption no longer takes the caption, and the picture, apart. Words pasted into a caption come as plain words in the caption’s own look, and a background that came with words pasted earlier gives way to the highlight you pick.' },
      { title: 'Your logo on the taskbar', text: 'On Windows an installed Nebula wore your logo on the desktop and not on the taskbar. The taskbar button wears it now, and changes when the logo does.' },
    ],
  },
  '0.9.4': {
    headline: 'Two ways to paste, toggle headings, the guide in your language, and your privacy written down.',
    items: [
      { title: 'Paste, two ways', text: 'A right-click pastes as Nebula format, or with the original format — the same, in the size the words were copied in — and Paste in the menus works again. Over selected words the right-click is one menu: the formatting buttons, Cut, Copy and the pastes.' },
      { title: 'Words that stay readable', text: 'Pasted words no longer keep the ink of the theme they were pasted in, which went black on dark in another theme. Notes that already hold such words are put right when this version first starts.' },
      { title: 'Bigger and smaller, and arrows', text: 'Ctrl + and Ctrl − size the selected words, or the line the caret is in. Typing --> and <-- makes → and ←.' },
      { title: 'Toggles', text: 'Toggle headings from the / menu, toggles inside bulleted and numbered lists, a click before the first letter puts the caret there, Enter at the start of a title makes a line above it, and Ctrl+B before typing works in a note with its own font.' },
      { title: 'The guide and this sheet in your language', text: 'Welcome to Nebula Guide follows Deutsch, Polski and Türkçe while you have not written in it, and so does what you are reading now.' },
      { title: 'Your privacy', text: 'Nebula does not read or save your AI chats: they go straight to the service you opened. Right-click an AI tab to clear its session data — its sign-in and cookies — and deleting a tab now asks first. The guide has a section on it.' },
      { title: 'Spelling', text: 'Ignore, beside Add to dictionary, leaves a word alone until you close the app. English accepts the American and the British spelling.' },
      { title: 'A theme of your own', text: 'The palette button at the right of the themes opens a colour editor: background, sidebar, lines, accent and text, the app changing as you pick. Name a profile and save it; Matcha, dark green with white words, is there as a ready one.' },
      { title: 'Pictures where you want them', text: 'A picture in the text stands at the left, in the middle or at the right of its line, and two pictures can share a line — from the picture’s bar, or by dragging it: a mark shows where it will land. A picture can also stand inside a line of words, like a letter of that line. Cards, videos and code blocks are dragged the same way, by their title line.' },
      { title: 'A divider that splits the page', text: 'Pull a divider sideways and it stands up: the part of the note above it becomes two columns, with a line to write on beside what was there. Drag the upright divider to change the widths; delete it and the columns are one flow again. Pulled over a column, a divider cuts that column again — as many columns as the line has room for; Word, OpenDocument and Rich Text files keep the columns, and where each picture stands. Four dashes typed on a line of their own make a divider.' },
      { title: 'Tables', text: 'Type /table, or press the table button on the bar: a table whose columns are numbered x1, x2… and whose rows y1, y2…, as in a spreadsheet. Pull the mouse over cells to select them — a background colour then colours their backs, and Merge and Unmerge stand at the selection’s lower right. The small square at its lower left is pulled to carry the cells on: a cell is copied, 1, 2 goes on with 3, 4. A + along the bottom adds a row and one at the right a column, the line beside an x makes its column wider and the one under a y its row higher, and the corner moves the table like a picture. A right-click in a cell adds a row above or below it, or a column at its left or right. The bar’s alignment buttons line up the words of a cell. A new table asks for its size first, and a table never reaches over the edge of its page: where there is no room, its columns are drawn narrower.' },
      { title: 'AI tabs that sleep', text: 'Each open tab held 170 to 300 MB. Tabs stay awake unless you say otherwise: right-click a tab → Let it sleep when unused, and after twenty minutes unseen it goes to sleep and gives its memory back, loading again where it was when you open it. A temporary chat, or words typed and not sent, keep it awake all the same; Put to sleep does it at once.' },
      { title: 'A folder for each note', text: 'A note is a folder of its own now — its file, its pictures and its videos in it — instead of one file with the pictures as text: a picture is written once, typing saves only the words, and an open note shows its pictures from those files instead of holding them in memory. A video file dropped on a note, or chosen with /video, is copied into that folder and played in the note, with a bar of its own (ten seconds back and on, the speed, the whole screen); every kind of video file is held, and an exported Nebula note takes its videos along whatever their size — the large ones in a folder beside it. The daily backup shares pictures and videos with the vault instead of copying them, and only the newest one is kept. Your vault is put aside as it was before the first change, and a deleted note takes its folder with it.' },
      { title: 'Black holes', text: 'Notes kept encrypted (AES-256), title and pictures included, in a section of their own under your notes. A black hole is opened with a 6-digit PIN, or with a passkey — your fingerprint, your face or the computer’s own PIN, asked for in front of Nebula; a hint can be kept with the PIN. It locks itself after ten minutes, and when the app starts. A note moved into one leaves the vault and every backup in the clear. Its recovery key, shown once, opens it on another computer or when the PIN is forgotten. A black hole goes to the Trash whole and locked, and is restored or deleted there.' },
      { title: 'Open with Nebula', text: 'Right-click a Word, OpenDocument or Rich Text file → Open with → Nebula, and it opens as a new note — in the Nebula that is already running; the file itself is not changed. Nebula offers itself for these files and never makes itself their default; choose it as the default yourself and they wear a violet document icon.' },
      { title: 'Fonts: search, add and keep', text: 'The Font menu has a search and + Add a font for any font on your computer. Words copied inside Nebula keep the font chosen for them; words pasted from outside take the note’s writing font. The font used last stands over + Add a font, with a pin.' },
      { title: 'Labels', text: 'Typing # lists the labels in use, to pick with ↓ or Tab. A label’s word can be edited, and with a label chosen in Filter by label a bar steps through its places in the open note.' },
      { title: 'Folders and the note list', text: '+ Add a note at the top of every open folder. A right-click on a note or a folder opens its menu, and the folded list no longer shows the dots over a note.' },
      { title: 'Settings, and a lock on opening', text: 'Settings, beside Help, sets the font, the text size and the page a new note starts with, and puts the AI panel or the black holes away. A 6-digit PIN can lock Nebula each time it opens — a passkey can be added beside it — and File → Lock Nebula shuts it at once; the lock keeps the app shut — a black hole is still what encrypts. In the Font menu, a pin beside a font puts it at the top of the list. At the foot of Settings, Nebula’s logo takes colours of your own, or a theme’s. Contrast joins Matcha as a ready profile of Your own theme, and a black hole asks for its PIN again before it is deleted or a note is taken out of it.' },
      { title: 'Smaller things', text: 'What’s new fits the window and scrolls, the page no longer jumps to the top after pasting a web address, the bar and the page no longer stand side by side while the app loads, and a thin line separates the page sizes from the bar’s buttons.' },
    ],
  },
  '0.9.3': {
    headline: 'Paper sizes, Word and OpenDocument, four languages, and a faster app.',
    items: [
      { title: 'Pages and paper', text: 'Beside Saved, choose Nebula Wide, Nebula Narrow or an A3\u2013B5 paper: the line breaks where it will on paper and thin lines show each page. Beside the alignment, the page zoom: on a paper 100 % is its real size, and Fit makes the sheet as wide as the window.' },
      { title: 'Auto order page', text: 'The button right of the zoom moves a shape or a picture that a page line falls across to the next page. Turn it on in a note\u2019s \u22ef menu and the note does it by itself.' },
      { title: 'Word, OpenDocument and a Mac\u2019s own', text: 'Export and import .docx, .odt, .doc, Rich Text and Evernote (.enex, for Apple Notes, Bear and Joplin). PDF and documents show their pages first, and a video goes out as its picture \u2014 it plays in Word \u2014 or as a bookmark.' },
      { title: 'Folders and your AI tabs', text: 'New folder beside New note; drag notes into folders and into the order you want. Right-click an AI tab to rename it, change its address or remove it; \u21bb reloads it, and MathGPT is in the panel.' },
      { title: 'English, Deutsch, Polski, Türkçe', text: 'Pick the language beside the version number at the bottom of the sidebar. Menus, buttons, hints and the spelling check follow at once; your notes are never translated.' },
      { title: 'Spelling suggestions', text: 'Right-click a word with a red underline for its corrections, or add it to the dictionary. A right-click on a picture copies it.' },
      { title: 'Toggle lists, @ and #', text: 'A line with an arrow folds away what is under it, lists and dividers included. @ mentions another note, #word writes a label into the text, and Filter by label shows the notes with a label on their title or in their text.' },
      { title: 'Crop pictures, resize embeds', text: '\u2702 on a picture\u2019s bar crops it; an embed is resized from any side or corner. Alt+\u2191 and Alt+\u2193 move a picture in the text.' },
      { title: 'Google sign-in in its own window', text: 'In every AI tab, Google\u2019s sign-in opens in a small window, the way Claude does it; when you are done the tab is signed in.' },
      { title: 'A font for each note', text: 'The font and size you picked last in a note are what its new lines are written in; what you already wrote keeps its font.' },
      { title: 'Faster, and fewer surprises', text: 'Saving no longer pauses the window in a large vault. Tab in a list moves only that item, a click picks a divider, Backspace next to a picture in the text selects it before deleting it, a double-click on a picture opens its caption, AI tabs no longer pop up a passkey window, and Windows no longer asks to let the app through its firewall.' },
    ],
  },
  '0.9.2': {
    headline: 'Google sign-in in the app, a theme colour, and pasted words in your note\u2019s font.',
    items: [
      { title: 'Google sign-in in the app', text: 'Continue with Google in an AI tab opens a small sign-in window; when you are done it closes and the tab is signed in. The blank Gemini panel is gone.' },
      { title: 'Theme color', text: 'The top of the text colour list gives words the theme\u2019s own ink again, pasted words in a fixed colour too.' },
      { title: 'Pasted words fit in', text: 'Text copied from a web page or another note takes this note\u2019s font, size and colour; bold, italic, lists and links stay.' },
      { title: 'Smaller things', text: 'The B, I and U buttons follow Ctrl+B and Ctrl+I at once, bullets sit in the middle of the line, leaving a list keeps your font, a picture\u2019s bar hides when the picture scrolls away, and the \u22ef menu reads Pin, Only view or Edit mode, Edit labels, Archive, Move to trash.' },
    ],
  },
  '0.9.1': {
    headline: 'Your older notes get the fixes too.',
    items: [
      { title: 'Old notes repaired', text: 'A fix to how notes are written now reaches the notes you already have, on every computer, not only new ones. The vault is copied to Backups first, and only how a note is built changes, never its words.' },
      { title: 'Deleted is deleted', text: 'A note you delete from the Trash is removed from every backup too, so it cannot be brought back from anywhere. Notes deleted earlier are taken out of the backups the first time this version starts.' },
      { title: 'Looking is not editing', text: 'Opening a note no longer moves it to the top as “just now”, and a page title arriving for a link is not an undo step, so redo keeps working.' },
      { title: 'Found in real notes', text: 'Backspace joins a whole line with several rows, a heading made with / on a line in a font keeps what you type, Enter then Backspace there no longer eats a space, /todo and /code land on the line they were typed on, and an embed is never named after an error page.' },
    ],
  },
  '0.9.0': {
    headline: 'Labels, four image corners, and Google sign-in in your browser.',
    items: [
      { title: 'Label your notes', text: 'Add labels beside the title or from a note’s ⋯ menu, find them by name, and search notes by #label. A Nebula note export keeps them.' },
      { title: 'Resize from any corner', text: 'Drag any of a picture’s four corners; on a floating picture the opposite corner stays put.' },
      { title: 'Google sign-in in your browser', text: 'When an AI tab sends you to Google, Nebula opens the service in your default browser instead. Carry on there; the browser’s sign-in does not come back into the panel.' },
      { title: 'Shapes keep their words and arrows', text: 'Text stays inside diamonds and triangles, arrows meet the real outline and follow the shape as it grows, and after an undo you can keep typing in the shape.' },
      { title: 'Clearer links and editing', text: 'Bookmarks show the page’s title when there is one, and an embed warns only after a real load failure. Backspace deletes selected text at once, and locked notes keep their pictures and shapes still.' },
    ],
  },
  '0.8.9': {
    headline: 'Lock a note to read it, arrows that snap on, and F12 for a picture of the window.',
    items: [
      { title: 'Only view', text: 'Tick Only view in a note\'s ⋯ menu and it can be read, copied and played but not changed. The guide starts that way; the 🔒 badge by the title unlocks it.' },
      { title: 'Arrows snap on', text: 'Bring an arrow\'s end near a shape, a picture or a link card: it is outlined and the end takes hold of its side. Let go and they stay joined.' },
      { title: 'F12', text: 'Takes a picture of the window, saves it in Pictures\\Nebula and copies it.' },
      { title: 'Diamonds and triangles', text: 'Selected, they outline their own edges, and a diamond\'s handles sit at its corners like every other shape\'s.' },
      { title: 'A fuller guide', text: 'Welcome to Nebula Guide now covers every part of the app, from the ⋯ menu and the / menu to every way of pasting a link, with a divider between its sections.' },
      { title: 'Undo in long notes', text: 'Ctrl+Z goes back step by step in a note full of pictures (it used to stop after one), and after Ctrl+Z or Ctrl+Y the caret is where the change was, so the next key does not land in other words.' },
      { title: 'Backspace gives the line back', text: 'Enter and then Backspace leaves the line as it was: no stray styles, and a list stays one list. An emptied code block goes with Backspace, and after deleting a divider or a picture the caret is back on your line.' },
      { title: 'Ctrl+U as you type', text: 'Ctrl+U with nothing selected underlines what you type next, like Ctrl+B and Ctrl+I.' },
      { title: 'No blank line above new blocks', text: '/todo and /code take the place of the empty line they were typed on.' },
    ],
  },
  // 0.8.7 was a test build only; its notes ship here.
  '0.8.8': {
    headline: 'Pictures and shapes share one canvas, and videos are sharp.',
    items: [
      { title: 'One canvas', text: 'A floating picture and a shape can lie over or under each other and be dragged across each other. ▴ puts the one you picked on top.' },
      { title: 'Three places for a picture', text: 'Its bar has one button each for behind the text, above the text and in the text; the lit one is where it is now.' },
      { title: 'Sharper videos', text: 'A video fills the width of the text, so YouTube sends a sharp picture, and it is black while it loads, like on a website.' },
      { title: 'Rust', text: 'Pick Rust for a code block: lifetimes, raw strings, macros and attributes each get their own colour. The guide has a sample.' },
      { title: 'Choose a link with the keyboard', text: 'After pasting a URL, press the down arrow to reach the choices, left and right to move between them, and Enter to use one. Esc takes you back to your text.' },
      { title: 'Undo in the right order', text: 'Moving a picture or a shape and then typing are two separate steps, so Ctrl+Z takes back the words first and the move next.' },
      { title: 'Saved means saved', text: 'The indicator at the top right no longer stays on "Saving…" after a click that changed nothing.' },
    ],
  },
  '0.8.6': {
    headline: 'Pasted images stay in your text, and arrows have their own menu.',
    items: [
      { title: 'Images in the text', text: 'A pasted image goes on the line you are on and moves with the text, at any window size. No more pictures over the words or gaps between paragraphs. Press ⇄ on the image bar to let one float freely again.' },
      { title: 'Captions stay under the picture', text: 'A caption on an image in the text sits under it instead of over the next paragraph.' },
      { title: 'An arrow menu', text: 'Straight, elbow and curved arrows have their own button beside the shapes, each with its picture and full name.' },
      { title: 'Cleaner video cards', text: 'Embedded videos no longer show the "preview blocked" hint under a working player.' },
      { title: 'The guide keeps up', text: 'Welcome to Nebula Guide now tells what each version adds, and updates itself while you have not written in it. Its shapes stand in a row above the text.' },
    ],
  },
  '0.8.5': {
    headline: 'Link any words, caption images, and YouTube links play in the note.',
    items: [
      { title: 'Link words', text: 'Select words and paste a URL over them, or press the link button in the toolbar. Ctrl+click a link to open it. An empty address takes a link off.' },
      { title: 'Image captions', text: 'Select an image and press Aa on its bar to write a caption under it. The caption moves with the image; Enter takes you back to your text.' },
      { title: 'Videos, not whole pages', text: 'Embed a YouTube or Vimeo link and you get the player, sized for video. A start time in the link is kept. Videos embedded earlier switch to the player when the note opens.' },
      { title: 'Leaving a quote', text: 'Press Enter on an empty line of a quote to carry on writing outside it, the way a list works.' },
      { title: 'Bold and italic stay off', text: 'Turn italic or bold off at the end of a line and press Enter: the next line starts plain.' },
      { title: 'Dividers stay on their own line', text: 'A divider added with the slash menu on an empty line no longer takes the next heading inside it.' },
    ],
  },
  '0.8.4': {
    headline: 'Slash commands work on every line you type, and arrows can be deleted.',
    items: [
      { title: 'Headings and lists on any line', text: 'Heading, list and quote commands now work on a line typed after a heading, not only on the first line of a note.' },
      { title: 'The angle leaves when you let go', text: 'The degrees show while a shape turns and disappear when you release it. Old notes that kept a stray number are cleaned when opened.' },
      { title: 'Delete an arrow', text: 'Click an arrow so it lights up, then press Delete or Backspace.' },
      { title: 'Safer note import', text: 'An imported Nebula note can no longer run anything. A note file copied straight out of another Nebula can be imported as it is.' },
    ],
  },
  '0.8.3': {
    headline: 'Slash commands stay on one line, and a note can move to another Nebula.',
    items: [
      { title: 'Headings and lists stay put', text: 'A slash command changes only the line you are on. A divider no longer slides inside a list, and Backspace deletes a slash instead of jumping to the rule.' },
      { title: 'Headings line up with the text', text: 'Heading 1, 2 and 3 start at the same left edge as a paragraph.' },
      { title: 'The window buttons match the bar', text: 'Minimise, maximise and close sit on the same strip as the menus, and the line under them runs along the bottom.' },
      { title: 'Shapes show their angle', text: 'While you turn a shape, the angle is shown in degrees.' },
      { title: 'Arrows', text: 'Straight, elbow and curved arrows sit with the shapes. Drag either end onto a shape, a link, an image or a line of text.' },
      { title: 'Embeds open the real page', text: 'An embed loads in its own view, so a site that refuses a frame can still show its page and its sign-in form. If a chat still calls this app insecure, use Sign in in browser.' },
      { title: 'Move a note intact', text: 'Export as a Nebula note and import that file in the other copy. Shapes, images and embeds come with it. Older notes are repaired when you open them.' },
    ],
  },
  // v0.8.1 was tagged but its Mac CI check failed, so it never published;
  // these notes ship with the next release instead.
  '0.8.2': {
    headline: 'Links, images and Mac upgrade instructions checked more deeply.',
    items: [
      { title: 'Link blocks behave like edits', text: 'Cards insert at your selection, can be deleted and support undo/redo. Embed now loads a sandboxed preview with an external-link fallback for sites that block it.' },
      { title: 'Safer image paste and editing', text: 'A pending image cannot land in another note after you switch. Corrupt images are rejected, proportions are preserved, and HTML imports keep safe image positions and sizes.' },
      { title: 'Caret and update guidance', text: 'Leaving inline formatting no longer jumps over preceding text. The Mac guide explains saving, backing up, replacing the app, security warnings and checking the new version.' },
    ],
  },
  '0.8.0': {
    headline: 'Links and images now paste like real note blocks.',
    items: [
      {
        title: 'Paste links four ways',
        text: 'Paste a web link and choose Embed, Bookmark, URL or Mention. The same four choices are available from the slash menu.',
      },
      {
        title: 'Images can float over a note',
        text: 'Copy or drop an image into a note, then drag it, resize it, or send it behind and bring it back above your text.',
      },
      {
        title: 'Backspace keeps the caret steady',
        text: 'Leaving inline formatting at the start of a line keeps the caret on the first visible character instead of jumping to the block edge.',
      },
    ],
  },
  '0.7.7': {
    headline: 'The last divider and code-block details are tidier.',
    items: [
      {
        title: 'Backspace closes divider gaps first',
        text: 'When a blank line sits between your text and a divider, the first Backspace removes that gap. The divider is selected only on the next press, and the caret stays at the text line.',
      },
      {
        title: 'The code hint gets out of the way',
        text: 'The Markdown-style editing hint is easier to read, disappears as soon as you type source, and stays hidden for code that already has content.',
      },
    ],
  },
  '0.7.6': {
    headline: 'The remaining editing problems in the two report notes.',
    items: [
      {
        title: 'Backspace joins the old note lines',
        text: 'Invisible shape layers no longer sit between ordinary text lines. Older highlighted and underlined text gets a proper paragraph you can click and type into.',
      },
      {
        title: 'Underline uses the colour of its words',
        text: 'The line follows coloured text, including wavy underline. Removing the underline keeps the other formatting.',
      },
      {
        title: 'Shape text can be erased normally',
        text: 'Backspace removes characters inside a shape instead of being blocked by the protection for the whole shape. Undo restores the text.',
      },
      {
        title: 'Close the gap before removing a divider',
        text: 'Backspace removes the empty line first, selects the divider next, and removes it only on the following press, including in older nested notes.',
      },
      {
        title: 'More room inside the code language picker',
        text: 'The box sits closer to the left edge, with space between its own edge and the language name.',
      },
    ],
  },
  '0.7.5': {
    headline: 'Safer saving, precise formatting, and shapes that follow the pointer.',
    items: [
      {
        title: 'Unsaved changes stay visible',
        text: 'Failed saves offer a retry. Closing waits for your latest title and text, and stays open if saving fails. Updates also stop if the safety backup cannot be made.',
      },
      {
        title: 'Edits stay with the right note',
        text: 'Archiving or switching immediately after typing no longer sends pending changes to the next note.',
      },
      {
        title: 'Formatting changes exactly what you selected',
        text: 'Repeated words, older underline marks and turning a style off at the cursor are handled precisely. Colour menus remain clickable on every side of the window.',
      },
      {
        title: 'The lowest shape moves up normally',
        text: 'Dragging a shape up from the bottom no longer scrolls the paper in the opposite direction and makes the shape look stuck.',
      },
      {
        title: 'Markdown keeps more of your note',
        text: 'Export keeps wrapped text and blank lines inside code. Code containing backticks can be imported again without cutting the block short.',
      },
    ],
  },
  '0.7.4': {
    headline: 'Underline switches off, and the shape names are visible.',
    items: [
      {
        title: 'Underline, colour and highlight switch off on a new line',
        text: 'Formatting carries across Enter, and these controls need a '
          + 'selection — so on a fresh empty line there was nothing to select '
          + 'and no way to turn the mark off. Every line after an underlined one '
          + 'came out underlined.',
      },
      {
        title: 'The shape names are readable again',
        text: 'They were in the menu the whole time at zero width, squeezed out '
          + 'when the menu was made narrower.',
      },
      {
        title: 'Untitled 2',
        text: 'A copy of your bug report note, built from scratch in the test '
          + 'build with the mouse and keyboard, to compare against.',
      },
    ],
  },
  '0.7.3': {
    headline: 'Built the note by hand, and fixed what that turned up.',
    items: [
      {
        title: 'Clicking a shape no longer jumps to the top',
        text: 'The view stayed where it was measured at; a change in the last '
          + 'release had been throwing it to the top of the note on every click.',
      },
      {
        title: 'Lists, to-dos and dividers stay separate blocks',
        text: 'Making a bulleted list, then a numbered one, then a to-do used to '
          + 'end with one to-do holding all of them — and a divider inserted '
          + 'inside it. Each is its own block now.',
      },
      {
        title: 'Enter on an empty to-do ends the run',
        text: 'The only way out before was to keep making empty to-dos.',
      },
      {
        title: 'A divider is always a line of its own',
        text: 'It went wherever the cursor was, including inside a to-do.',
      },
    ],
  },
  '0.7.2': {
    headline: 'Toolbar marks that tell the truth, and one outline weight.',
    items: [
      {
        title: 'Bold no longer looks stuck',
        text: 'With the cursor next to a bold word the Bold button lit up on '
          + 'plain text. The marks now show what the cursor is standing in.',
      },
      {
        title: 'Underline shows at the start of a line',
        text: 'At the very beginning of an underlined line there was no mark at '
          + 'all, because the cursor sits just outside the underline there.',
      },
      {
        title: 'A blank line under a divider goes first',
        text: 'The divider was offered while the empty row beneath it stayed put, '
          + 'so the gap could never be closed. The row goes, then the divider.',
      },
      {
        title: 'Every shape has the same outline',
        text: 'The diamond and triangle are stroked properly now instead of being '
          + 'drawn as a fill inset from the edge, which made their line a '
          + 'different weight from the square’s and thinner at a sharp corner.',
      },
      {
        title: 'A shape no longer moves the bottom of the note',
        text: 'While one is being dragged the note holds its size, so the page '
          + 'does not shift under your hand.',
      },
    ],
  },
  '0.7.1': {
    headline: 'Deleting near a shape, and dragging one, both behave.',
    items: [
      {
        title: 'No delete key can take your shapes',
        text: 'Pressing Backspace twice just before a line that sat under a '
          + 'shape removed every shape in the note. The rule was working out '
          + 'which element WOULD go; it now asks the browser what is actually '
          + 'about to be deleted.',
      },
      {
        title: 'A divider really does take two presses',
        text: 'The first highlights it, the second removes it.',
      },
      {
        title: 'Shapes drag freely again',
        text: 'A limit added in the last release threw a tall shape upwards on '
          + 'the first pixel of movement and then would not let it come back '
          + 'down. It is gone.',
      },
    ],
  },
  '0.7.0': {
    headline: 'Blank lines that are really blank, and a resize that stops.',
    items: [
      {
        title: 'Blank lines behave again',
        text: 'A line you cleared kept the underline, highlight and colour it '
          + 'used to carry, as empty wrappers a few pixels wide. The cursor '
          + 'vanished inside them and anything typed there came out formatted. '
          + 'They are emptied when the note opens.',
      },
      {
        title: 'The AI panel stops resizing when you let go',
        text: 'Dragging its edge over the panel itself meant the release was '
          + 'never seen, so it kept growing until you clicked again.',
      },
      {
        title: 'One line weight for every shape, at every size',
        text: 'The diamond and triangle outlines were set as a percentage, so '
          + 'they grew thicker as the shape did.',
      },
      {
        title: 'A divider takes two presses',
        text: 'The first highlights it, the second removes it — so you can bring '
          + 'a block up close to a divider without losing it.',
      },
      {
        title: 'The code block language sits with the code',
        text: 'It was lined up with the block edge instead.',
      },
      {
        title: 'A shape stays inside the note',
        text: 'Dragging one below the last paragraph used to pull the bottom of '
          + 'the note down with it, and shove it back up on the way home.',
      },
    ],
  },
  '0.6.9': {
    headline: 'Shapes you can turn, and an export with margins on every page.',
    items: [
      {
        title: 'Shapes rotate',
        text: 'A second grip at the bottom-left turns the shape; hold Shift to '
          + 'snap to fifteen degrees.',
      },
      {
        title: 'The shape menu shows the shapes',
        text: 'Each row is drawn as the shape it makes, in the same line weight, '
          + 'instead of the nearest character a font happened to have.',
      },
      {
        title: 'One line weight for every shape',
        text: 'The diamond read as heavier than the square and the triangle went '
          + 'thin at its point, because the outline was a box inset rather than a '
          + 'line drawn parallel to each edge.',
      },
      {
        title: 'Backspace cannot swallow your shapes',
        text: 'Pressing it beside a shape layer removed every shape in the note '
          + 'in one keystroke.',
      },
      {
        title: 'Exported pages keep their margins',
        text: 'All four 1.27 cm margins now hold on every page, not only the '
          + 'first. The note is printed as a document of its own rather than as a '
          + 'picture of the window.',
      },
      {
        title: 'The website says what this build is',
        text: 'Its "Right now" line had been stuck several releases back.',
      },
    ],
  },
  '0.6.8': {
    headline: 'Lists that line up, Enter in code blocks, and a clean page edge.',
    items: [
      {
        title: 'Bullets and numbers start in the same column',
        text: 'A bullet and a "1." were pushed apart because a list marker is '
          + 'right-aligned by default. They are drawn in a fixed column now, so '
          + 'even "10." begins where the bullet does.',
      },
      {
        title: 'Enter works inside a code block',
        text: 'It did nothing at all: the newline was being handed to the browser '
          + 'in a way it quietly discards.',
      },
      {
        title: 'Nothing selected, nothing changed',
        text: 'A colour picked with no selection used to recolour the whole line, '
          + 'like the font did. Both leave the line alone now. Text no longer '
          + 'changes size on its own in places you never touched.',
      },
      {
        title: 'Highlighting does not nudge the line',
        text: 'Applying a background shifted every following word sideways and '
          + 'shifted it back when removed.',
      },
      {
        title: 'A clean page edge in exports',
        text: 'The thin dark line along the top of every exported page is gone.',
      },
      {
        title: 'Shapes and the toolbar',
        text: 'A shape cannot be dragged smaller than the words inside it, the '
          + 'shape menu marks are bolder, and the size box shows what it is about '
          + 'to change while you type in it.',
      },
      {
        title: 'The cursor stays in the note',
        text: 'Holding the up arrow at the top used to carry it out of the page '
          + 'entirely, somewhere nothing you typed would land.',
      },
    ],
  },
  '0.6.7': {
    headline: 'Switches that switch off, and one typeface for the whole app.',
    items: [
      {
        title: 'Underline and highlight turn off again',
        text: 'Pressing Underline on underlined text removes it, the way Bold '
          + 'always has. Picking a highlight you already have clears it.',
      },
      {
        title: 'A font only changes what you selected',
        text: 'Picking a font with nothing selected no longer restyles the whole '
          + 'line.',
      },
      {
        title: 'Empty lines have a cursor again',
        text: 'A blank line written by the app had no height and no caret, so '
          + 'clicking it put the cursor nowhere you could see.',
      },
      {
        title: 'Shapes',
        text: 'Square and circle join the set, the button repeats whichever kind '
          + 'you chose last, double-clicking the text selects all of it, and bold, '
          + 'italic and underline work inside a shape. Arrow keys no longer walk '
          + 'the cursor into one.',
      },
      {
        title: 'Exports use A4 with narrow margins',
        text: '1.27 cm on all four sides, the note title at the top, and no dark '
          + 'band around the page.',
      },
      {
        title: 'One typeface',
        text: 'The panels, menus and code-block labels are set in the same face as '
          + 'the Nebula wordmark. Only code itself stays monospaced.',
      },
      {
        title: 'Opening it on a Mac',
        text: 'macOS says it cannot verify the app, because registering with Apple '
          + 'costs money and Nebula is not registered. The release page now names '
          + 'exactly which two clicks get past the dialog — you do it once.',
      },
    ],
  },
  '0.6.4': {
    headline: 'Deleting, underlining, and a tidier toolbar.',
    items: [
      {
        title: 'Code blocks delete with Backspace',
        text: 'Press Backspace at the start of the line under a code block and the '
          + 'block goes, even when a colour or a font was applied around it — which '
          + 'is what put the block and that line inside the same wrapper and made it '
          + 'unreachable before.',
      },
      {
        title: 'The underline button lights up',
        text: 'Underline now shows as active in the toolbar the way Bold and Italic '
          + 'do, and Ctrl+U makes the same underline the button makes.',
      },
      {
        title: 'A smaller size box',
        text: 'The font size list drops the repeated "px", the field is narrower, and '
          + 'its arrow sits next to the number instead of across a gap.',
      },
      {
        title: 'The collapsed note list',
        text: 'The theme buttons no longer show stray lines down their side when the '
          + 'list is narrowed.',
      },
      {
        title: 'This screen',
        text: 'Every update now says what changed. Help → What’s new opens it again.',
      },
    ],
  },
  '0.6.3': {
    headline: 'What the old notes were still holding.',
    items: [
      {
        title: 'Old notes are brought up to date when they open',
        text: 'A shape saved with more text than it had room for is measured again, '
          + 'so it grows instead of clipping what you typed.',
      },
      {
        title: 'Underlining across two paragraphs works',
        text: 'It used to apply and underline nothing at all, and split the paragraph '
          + 'you started in.',
      },
      {
        title: 'Exported PDFs are white to the edge',
        text: 'The dark frame around the page is gone.',
      },
    ],
  },
};

/** The notes for a version, or null when there is nothing to say about it. */
/**
 * The same sheet in the app's other languages (0.9.4: "the welcome page and
 * the information should switch too"). Item for item with the English entry;
 * a version or a language that is not here is shown in English.
 */
export const RELEASE_NOTES_I18N = {
  '0.9.6': {
    de: {
      headline: 'Dateien in einer Notiz, eine Seite, die zuerst fragt, und eine sicherere App.',
      items: [
        { title: 'Dateien in einer Notiz', text: 'Zieh eine beliebige Datei auf eine Notiz oder tippe /file: Sie bleibt als Karte mit Namen, Art und Größe in der Notiz. Ein Klick speichert eine Kopie, wo du willst; Öffnen gibt sie dem Programm, das dein Computer dafür hat. Ein Programm oder Skript fragt, bevor es läuft, und eine Kopie, die Nebula verlässt, ist als heruntergeladen markiert, wie es ein Browser tut.' },
        { title: 'Eine Seite in einer Notiz fragt zuerst', text: 'Eine eingebettete Seite, die dein Mikrofon, deine Kamera oder Benachrichtigungen möchte, fragt dich, und Nicht erlauben ist schon gewählt. Die Antwort wird nie behalten: Beim nächsten Öffnen fragt die Seite erneut. Die Anleitung hat einen Abschnitt dazu.' },
        { title: 'Sicherer', text: 'Ein Link in einer Notiz kann das Fenster der App nicht mehr zu einer Webseite wegführen, eine eingebettete Seite kann keine Fenster mehr von selbst öffnen oder lesen, was du kopiert hast, und Nebula sperren nimmt eine aus einem schwarzen Loch geöffnete Datei und eine PDF-Vorschau mit.' },
        { title: 'Dinge finden', text: 'Suchen, das Suchfeld und jede Liste, in die du tippst, finden İstanbul, wie auch immer das I getippt wird; ein Treffer in einer zugeklappten Aufklappliste öffnet sie, und die Sprache eines Codeblocks zählt nicht mehr als Treffer.' },
        { title: 'Kleinigkeiten', text: 'Die Fenster zum Speichern und Öffnen sprechen deine Sprache, ein gekürzter Name schneidet nie ein Emoji in zwei Hälften, und eine Karte lässt sich mit der Tastatur wählen, entfernen und öffnen.' },
      ],
    },
    pl: {
      headline: 'Pliki w notatce, strona, która najpierw pyta, i bezpieczniejsza aplikacja.',
      items: [
        { title: 'Pliki w notatce', text: 'Przeciągnij dowolny plik na notatkę albo wpisz /file: zostaje w notatce jako karta z nazwą, rodzajem i rozmiarem. Kliknięcie zapisuje kopię, gdzie chcesz; Otwórz przekazuje ją programowi, który twój komputer ma dla takich plików. Program albo skrypt pyta, zanim się uruchomi, a kopia, która opuszcza aplikację Nebula, jest oznaczona jako pobrana, jak robi to przeglądarka.' },
        { title: 'Strona w notatce najpierw pyta', text: 'Osadzona strona, która chce mikrofonu, kamery albo powiadomień, pyta ciebie, a Nie zezwalaj jest już wybrane. Odpowiedź nigdy nie jest zachowywana: przy następnym otwarciu strona pyta znowu. Przewodnik ma o tym część.' },
        { title: 'Bezpieczniej', text: 'Link w notatce nie może już zabrać okna aplikacji na stronę internetową, osadzona strona nie może już sama otwierać okien ani czytać skopiowanych treści, a Zablokuj Nebula zabiera ze sobą plik otwarty z czarnej dziury i podgląd PDF.' },
        { title: 'Szukanie', text: 'Znajdź, pole wyszukiwania i każda lista, w której piszesz, znajdują İstanbul, jakkolwiek wpiszesz I; trafienie w zwiniętej sekcji ją otwiera, a język bloku kodu nie liczy się już jako trafienie.' },
        { title: 'Drobiazgi', text: 'Okna zapisu i otwierania mówią w twoim języku, skrócona nazwa nigdy nie przecina emoji na pół, a kartę można wybrać, usunąć i otworzyć z klawiatury.' },
      ],
    },
    tr: {
      headline: 'Nottaki dosyalar, önce soran bir sayfa ve daha güvenli bir uygulama.',
      items: [
        { title: 'Nottaki dosyalar', text: 'Herhangi bir dosyayı bir notun üzerine sürükleyin ya da /file yazın: adı, türü ve boyutuyla bir kart olarak notta kalır. Bir tık, bir kopyasını istediğiniz yere kaydeder; Aç, onu bilgisayarınızın o dosya için kullandığı programa verir. Bir program ya da betik çalışmadan önce sorar; Nebula’dan çıkan bir kopya da, bir tarayıcının yaptığı gibi, indirilmiş olarak işaretlenir.' },
        { title: 'Nottaki bir sayfa önce sorar', text: 'Mikrofonunuzu, kameranızı ya da bildirimleri isteyen gömülü bir sayfa size sorar; İzin verme zaten seçilidir. Cevap hiçbir zaman saklanmaz: sayfa bir dahaki açılışta yeniden sorar. Kılavuzda bununla ilgili bir bölüm var.' },
        { title: 'Daha güvenli', text: 'Nottaki bir bağlantı artık uygulamanın penceresini bir web sayfasına götüremez, gömülü bir sayfa artık kendi kendine pencere açamaz ya da kopyaladıklarınızı okuyamaz; Nebula’yı kilitle de bir kara delikten açılmış dosyayı ve PDF önizlemesini birlikte götürür.' },
        { title: 'Bir şey bulmak', text: 'Bul, arama kutusu ve yazdığınız her liste, I nasıl yazılırsa yazılsın İstanbul’u bulur; katlanmış bir açılır bölümdeki eşleşme onu açar, bir kod bloğunun dili de artık eşleşme sayılmaz.' },
        { title: 'Küçük şeyler', text: 'Kaydetme ve açma pencereleri sizin dilinizde konuşur, kısaltılan bir ad bir emojiyi asla ikiye bölmez, bir kart da klavyeyle seçilip kaldırılabilir ve açılabilir.' },
      ],
    },
  },
  '0.9.5': {
    de: {
      headline: 'Eine Bildunterschrift bleibt bei ihrem Bild, und die Taskleiste trägt dein Logo.',
      items: [
        { title: 'Bildunterschriften', text: 'Eine Hervorhebung oder eine Farbe für die Wörter einer Bildunterschrift nimmt die Unterschrift und das Bild nicht mehr auseinander. In eine Bildunterschrift eingefügte Wörter kommen als reine Wörter im Aussehen der Unterschrift, und ein Hintergrund, den früher eingefügte Wörter mitgebracht haben, weicht der Hervorhebung, die du wählst.' },
        { title: 'Dein Logo in der Taskleiste', text: 'Unter Windows trug ein installiertes Nebula dein Logo auf dem Desktop, aber nicht in der Taskleiste. Der Knopf in der Taskleiste trägt es jetzt und ändert sich mit dem Logo.' },
      ],
    },
    pl: {
      headline: 'Podpis zostaje przy swoim obrazie, a pasek zadań nosi twoje logo.',
      items: [
        { title: 'Podpisy', text: 'Wyróżnienie albo kolor nadany słowom podpisu pod obrazem nie rozrywa już podpisu ani obrazu. Słowa wklejone do podpisu przychodzą jako zwykłe słowa w wyglądzie podpisu, a tło, które przyszło ze słowami wklejonymi wcześniej, ustępuje wyróżnieniu, które wybierzesz.' },
        { title: 'Twoje logo na pasku zadań', text: 'W systemie Windows zainstalowana aplikacja Nebula nosiła twoje logo na pulpicie, ale nie na pasku zadań. Przycisk na pasku zadań nosi je teraz i zmienia się razem z logo.' },
      ],
    },
    tr: {
      headline: 'Alt yazı resminin yanında kalıyor, görev çubuğu da logonuzu taşıyor.',
      items: [
        { title: 'Alt yazılar', text: 'Bir resmin alt yazısındaki sözcüklere verilen vurgu ya da renk artık alt yazıyı ve resmi parçalamıyor. Alt yazıya yapıştırılan sözcükler, alt yazının kendi görünümünde düz sözcükler olarak gelir; daha önce yapıştırılan sözcüklerle gelen arka plan da seçtiğiniz vurguya yerini bırakır.' },
        { title: 'Logonuz görev çubuğunda', text: 'Windows’ta kurulu Nebula logonuzu masaüstünde taşıyor, görev çubuğunda taşımıyordu. Görev çubuğu düğmesi artık onu taşıyor ve logo değişince o da değişiyor.' },
      ],
    },
  },
  '0.9.4': {
    de: {
      headline: 'Zwei Arten einzufügen, Aufklapp-Überschriften, die Anleitung in deiner Sprache und deine Privatsphäre, aufgeschrieben.',
      items: [
        { title: 'Einfügen, auf zwei Arten', text: 'Ein Rechtsklick fügt im Nebula-Format ein oder mit dem Originalformat — dasselbe, in der Größe, in der die Wörter kopiert wurden — und Einfügen in den Menüs funktioniert wieder. Über markierten Wörtern ist der Rechtsklick ein einziges Menü: die Formatknöpfe, Ausschneiden, Kopieren und die zwei Arten einzufügen.' },
        { title: 'Wörter, die lesbar bleiben', text: 'Eingefügte Wörter behalten nicht mehr die Tinte des Designs, in dem sie eingefügt wurden — in einem anderen Design wurden sie schwarz auf dunkel. Notizen, die solche Wörter schon enthalten, werden beim ersten Start dieser Version in Ordnung gebracht.' },
        { title: 'Größer und kleiner, und Pfeile', text: 'Strg + und Strg − ändern die Größe der markierten Wörter oder der Zeile, in der der Cursor steht. Aus --> und <-- werden → und ←.' },
        { title: 'Aufklapplisten', text: 'Aufklapp-Überschriften aus dem /-Menü, Aufklapplisten in Aufzählungen und nummerierten Listen, ein Klick vor den ersten Buchstaben setzt den Cursor dorthin, Enter am Anfang eines Titels macht eine Zeile darüber, und Strg+B vor dem Tippen funktioniert in einer Notiz mit eigener Schrift.' },
        { title: 'Anleitung und dieses Blatt in deiner Sprache', text: 'Die Anleitung „Willkommen bei Nebula“ folgt Deutsch, Polski und Türkçe, solange du nicht in ihr geschrieben hast, und ebenso das, was du gerade liest.' },
        { title: 'Deine Privatsphäre', text: 'Nebula liest und speichert deine KI-Chats nicht: Sie gehen direkt an den Dienst, den du geöffnet hast. Ein Rechtsklick auf einen KI-Tab löscht seine Sitzungsdaten — Anmeldung und Cookies — und vor dem Löschen eines Tabs wird jetzt gefragt. Die Anleitung hat einen Abschnitt dazu.' },
        { title: 'Rechtschreibung', text: 'Ignorieren, neben Zum Wörterbuch hinzufügen, lässt ein Wort in Ruhe, bis du die App schließt. Englisch nimmt die amerikanische und die britische Schreibweise an.' },
        { title: 'Ein eigenes Design', text: 'Der Paletten-Knopf rechts neben den Designs öffnet einen Farbeditor: Hintergrund, Seitenleiste, Linien, Akzent und Schrift — die App ändert sich, während du wählst. Gib einem Profil einen Namen und speichere es; Matcha, dunkles Grün mit weißer Schrift, ist als fertiges dabei.' },
        { title: 'Bilder, wo du sie haben willst', text: 'Ein Bild im Text steht links, in der Mitte oder rechts in seiner Zeile, und zwei Bilder können sich eine Zeile teilen — über die Leiste des Bildes oder durch Ziehen: Eine Markierung zeigt, wo es landet. Ein Bild kann auch mitten in einer Textzeile stehen, wie ein Buchstabe dieser Zeile. Karten, Videos und Codeblöcke werden genauso gezogen, an ihrer Titelzeile.' },
        { title: 'Eine Trennlinie, die die Seite teilt', text: 'Zieh eine Trennlinie zur Seite, und sie stellt sich auf: Der Teil der Notiz darüber wird zu zwei Spalten, mit einer Zeile zum Schreiben neben dem, was dort stand. Zieh die senkrechte Trennlinie, um die Breiten zu ändern; lösch sie, und die Spalten sind wieder ein Fluss. Über eine Spalte gezogen, teilt eine Trennlinie diese Spalte noch einmal — so viele Spalten, wie die Zeile Platz hat; Word-, OpenDocument- und Rich-Text-Dateien behalten die Spalten und den Platz jedes Bildes. Vier Striche allein in einer Zeile ergeben eine Trennlinie.' },
        { title: 'Tabellen', text: 'Tippe /table oder drücke den Tabellen-Knopf der Leiste: eine Tabelle, deren Spalten x1, x2 … und deren Zeilen y1, y2 … heißen, wie in einer Tabellenkalkulation. Zieh die Maus über Zellen, um sie auszuwählen — eine Hintergrundfarbe färbt dann ihren Hintergrund, und Verbinden und Trennen stehen unten rechts an der Auswahl. Am kleinen Quadrat unten links ziehst du, um die Zellen fortzusetzen: Eine Zelle wird kopiert, auf 1, 2 folgen 3, 4. Ein + am unteren Rand fügt eine Zeile hinzu und eines rechts eine Spalte, die Linie neben einem x macht die Spalte breiter und die unter einem y die Zeile höher, und an der Ecke verschiebst du die Tabelle wie ein Bild. Ein Rechtsklick in eine Zelle fügt eine Zeile darüber oder darunter oder eine Spalte links oder rechts ein. Die Ausrichtungs-Knöpfe der Leiste richten die Wörter einer Zelle aus. Eine neue Tabelle fragt zuerst nach ihrer Größe, und eine Tabelle reicht nie über den Rand ihrer Seite hinaus: Wo kein Platz ist, werden ihre Spalten schmaler gezeichnet.' },
        { title: 'KI-Tabs, die schlafen', text: 'Jeder offene Tab hielt 170 bis 300 MB. Tabs bleiben wach, solange du nichts anderes sagst: Rechtsklick auf einen Tab → Bei Nichtgebrauch schlafen lassen, und nach zwanzig Minuten ohne Blick legt er sich schlafen und gibt seinen Speicher zurück; er lädt dort neu, wo er war, wenn du ihn öffnest. Ein temporärer Chat oder getippte, nicht gesendete Worte halten ihn trotzdem wach; Schlafen legen tut es sofort.' },
        { title: 'Ein Ordner für jede Notiz', text: 'Eine Notiz ist jetzt ein eigener Ordner — ihre Datei, ihre Bilder und ihre Videos darin — statt einer Datei mit den Bildern als Text: Ein Bild wird einmal geschrieben, beim Tippen werden nur die Worte gespeichert, und eine geöffnete Notiz zeigt ihre Bilder aus diesen Dateien, statt sie im Speicher zu halten. Eine auf eine Notiz gezogene oder mit /video gewählte Videodatei wird in diesen Ordner kopiert und in der Notiz abgespielt, mit einer eigenen Leiste (zehn Sekunden zurück und vor, das Tempo, der ganze Bildschirm); jede Art von Videodatei wird aufgenommen, und eine exportierte Nebula-Notiz nimmt ihre Videos mit, gleich wie groß — die großen in einem Ordner daneben. Die tägliche Sicherung teilt Bilder und Videos mit dem Tresor, statt sie zu kopieren, und nur die neueste bleibt. Dein Tresor wird vor der ersten Änderung so beiseitegelegt, wie er war, und eine gelöschte Notiz nimmt ihren Ordner mit.' },
        { title: 'Schwarze Löcher', text: 'Verschlüsselt aufbewahrte Notizen (AES-256), Titel und Bilder eingeschlossen, in einem eigenen Bereich unter deinen Notizen. Ein schwarzes Loch wird mit einer 6-stelligen PIN geöffnet oder mit einem Passkey — deinem Fingerabdruck, deinem Gesicht oder der PIN des Computers, vor Nebula abgefragt; zur PIN kann ein Hinweis aufbewahrt werden. Es sperrt sich nach zehn Minuten selbst und beim Start der App. Eine hineinverschobene Notiz verlässt den Tresor und jede Sicherung im Klartext. Sein Wiederherstellungsschlüssel, einmal gezeigt, öffnet es auf einem anderen Computer oder wenn die PIN vergessen ist. Ein schwarzes Loch kommt als Ganzes und gesperrt in den Papierkorb und wird dort wiederhergestellt oder gelöscht.' },
        { title: 'Öffnen mit Nebula', text: 'Rechtsklick auf eine Word-, OpenDocument- oder Rich-Text-Datei → Öffnen mit → Nebula, und sie öffnet sich als neue Notiz — in dem Nebula, das schon läuft; die Datei selbst wird nicht verändert. Nebula bietet sich für diese Dateien an und macht sich nie selbst zum Standard; wähle es selbst als Standard, und sie tragen ein violettes Dokumentsymbol.' },
        { title: 'Schriften: suchen, hinzufügen und behalten', text: 'Das Menü Schriftart hat eine Suche und + Schriftart hinzufügen für jede Schrift auf deinem Computer. In Nebula kopierte Wörter behalten die für sie gewählte Schrift; von außen eingefügte Wörter nehmen die Schreibschrift der Notiz an. Die zuletzt verwendete Schrift steht über + Schriftart hinzufügen, mit einer Nadel.' },
        { title: 'Labels', text: 'Beim Tippen von # erscheinen die benutzten Labels, zum Auswählen mit ↓ oder Tab. Das Wort eines Labels lässt sich bearbeiten, und ist in Nach Label filtern ein Label gewählt, geht eine Leiste durch seine Stellen in der offenen Notiz.' },
        { title: 'Ordner und die Notizliste', text: '+ Notiz hinzufügen oben in jedem offenen Ordner. Ein Rechtsklick auf eine Notiz oder einen Ordner öffnet das Menü dazu, und die eingeklappte Liste zeigt die Punkte nicht mehr über einer Notiz.' },
        { title: 'Einstellungen und eine Sperre beim Öffnen', text: 'Einstellungen, neben Hilfe, legt Schriftart, Schriftgröße und Seite fest, mit denen eine neue Notiz beginnt, und räumt den KI-Bereich oder die schwarzen Löcher weg. Eine 6-stellige PIN kann Nebula bei jedem Öffnen sperren — ein Passkey kann dazukommen —, und Datei → Nebula sperren verschließt es sofort; die Sperre hält die App verschlossen — verschlüsselt wird weiterhin im schwarzen Loch. Im Menü Schriftart setzt eine Nadel neben einer Schrift sie an den Anfang der Liste. Am Fuß der Einstellungen bekommt das Logo von Nebula deine eigenen Farben oder die eines Designs. Contrast kommt neben Matcha als fertiges Profil von Dein eigenes Design dazu, und ein schwarzes Loch fragt erneut nach seiner PIN, bevor es gelöscht oder eine Notiz herausgenommen wird.' },
        { title: 'Kleinere Dinge', text: 'Neuigkeiten passt ins Fenster und scrollt, die Seite springt nach dem Einfügen einer Webadresse nicht mehr nach oben, Leiste und Seite stehen beim Laden nicht mehr nebeneinander, und eine dünne Linie trennt die Seitengrößen von den Knöpfen der Leiste.' },
      ],
    },
    pl: {
      headline: 'Dwa sposoby wklejania, rozwijane nagłówki, przewodnik w twoim języku i twoja prywatność czarno na białym.',
      items: [
        { title: 'Wklejanie na dwa sposoby', text: 'Prawy przycisk wkleja w formacie Nebula albo z oryginalnym formatem — to samo, w rozmiarze, w jakim słowa zostały skopiowane — a Wklej w menu znów działa. Nad zaznaczonymi słowami prawy przycisk to jedno menu: przyciski formatowania, Wytnij, Kopiuj i dwa sposoby wklejania.' },
        { title: 'Słowa, które pozostają czytelne', text: 'Wklejone słowa nie zachowują już atramentu motywu, w którym je wklejono — w innym motywie robiły się czarne na ciemnym. Notatki, które już zawierają takie słowa, są naprawiane przy pierwszym uruchomieniu tej wersji.' },
        { title: 'Większe i mniejsze, i strzałki', text: 'Ctrl + i Ctrl − zmieniają rozmiar zaznaczonych słów albo linii, w której stoi kursor. Wpisanie --> i <-- daje → i ←.' },
        { title: 'Listy rozwijane', text: 'Rozwijane nagłówki z menu /, listy rozwijane wewnątrz list punktowanych i numerowanych, kliknięcie przed pierwszą literą stawia tam kursor, Enter na początku tytułu tworzy linię nad nim, a Ctrl+B przed pisaniem działa w notatce z własną czcionką.' },
        { title: 'Przewodnik i ta karta w twoim języku', text: 'Przewodnik „Witaj w Nebula” idzie za Deutsch, Polski i Türkçe, dopóki nic w nim nie napiszesz, i tak samo to, co teraz czytasz.' },
        { title: 'Twoja prywatność', text: 'Nebula nie czyta ani nie zapisuje twoich rozmów z AI: idą prosto do usługi, którą otworzyłeś. Kliknij kartę AI prawym przyciskiem, aby wyczyścić dane jej sesji — logowanie i pliki cookie — a usunięcie karty najpierw o to pyta. Przewodnik ma o tym osobną część.' },
        { title: 'Pisownia', text: 'Ignoruj, obok Dodaj do słownika, zostawia słowo w spokoju do zamknięcia aplikacji. Angielski przyjmuje pisownię amerykańską i brytyjską.' },
        { title: 'Własny motyw', text: 'Przycisk palety po prawej stronie motywów otwiera edytor kolorów: tło, pasek boczny, linie, akcent i tekst — aplikacja zmienia się, gdy wybierasz. Nazwij profil i zapisz go; Matcha, ciemna zieleń z białym pismem, jest tam jako gotowy.' },
        { title: 'Obrazy tam, gdzie chcesz', text: 'Obraz w tekście stoi po lewej, pośrodku albo po prawej stronie swojej linii, a dwa obrazy mogą dzielić jedną linię — z paska obrazu albo przez przeciągnięcie: znacznik pokazuje, gdzie wyląduje. Obraz może też stać w środku wiersza tekstu, jak litera tego wiersza. Karty, filmy i bloki kodu przeciąga się tak samo, za linię tytułu.' },
        { title: 'Separator, który dzieli stronę', text: 'Pociągnij separator w bok, a stanie pionowo: część notatki nad nim staje się dwiema kolumnami, z linią do pisania obok tego, co tam było. Przeciągnij pionowy separator, aby zmienić szerokości; usuń go, a kolumny znów będą jednym ciągiem. Pociągnięty nad kolumną separator dzieli ją jeszcze raz — tyle kolumn, ile zmieści linia; pliki Word, OpenDocument i Rich Text zachowują kolumny i miejsce każdego obrazu. Cztery kreski wpisane w osobnej linii dają separator.' },
        { title: 'Tabele', text: 'Wpisz /table albo naciśnij przycisk tabeli na pasku: tabela, której kolumny mają numery x1, x2…, a wiersze y1, y2…, jak w arkuszu kalkulacyjnym. Przeciągnij mysz po komórkach, aby je zaznaczyć — kolor tła koloruje wtedy ich tło, a Scal i Rozdziel stoją w prawym dolnym rogu zaznaczenia. Mały kwadrat w lewym dolnym rogu przeciąga się, aby przenieść komórki dalej: komórka jest kopiowana, po 1, 2 idą 3, 4. + wzdłuż dołu dodaje wiersz, a ten po prawej kolumnę, linia obok x poszerza kolumnę, linia pod y podwyższa wiersz, a róg przesuwa tabelę jak obraz. Kliknięcie komórki prawym przyciskiem wstawia wiersz powyżej lub poniżej albo kolumnę z lewej lub z prawej. Przyciski wyrównania na pasku wyrównują słowa w komórce. Nowa tabela najpierw pyta o rozmiar, a tabela nigdy nie wychodzi poza krawędź strony: gdzie brakuje miejsca, jej kolumny są rysowane węziej.' },
        { title: 'Karty AI, które zasypiają', text: 'Każda otwarta karta zajmowała od 170 do 300 MB. Karty nie zasypiają, dopóki nie zdecydujesz inaczej: kliknij kartę prawym przyciskiem → Usypiaj, gdy nieużywana, a po dwudziestu minutach bez patrzenia zaśnie i odda pamięć; po otwarciu wczytuje się tam, gdzie była. Czat tymczasowy albo słowa wpisane i niewysłane i tak nie pozwalają jej zasnąć; Uśpij usypia ją od razu.' },
        { title: 'Folder dla każdej notatki', text: 'Notatka jest teraz własnym folderem — w nim jej plik, jej obrazy i jej wideo — zamiast jednego pliku z obrazami jako tekstem: obraz zapisuje się raz, pisanie zapisuje tylko słowa, a otwarta notatka pokazuje obrazy z tych plików, zamiast trzymać je w pamięci. Plik wideo upuszczony na notatkę albo wybrany przez /video jest kopiowany do tego folderu i odtwarzany w notatce, z własnym paskiem (dziesięć sekund wstecz i naprzód, szybkość, pełny ekran); przyjmowany jest każdy rodzaj pliku wideo, a wyeksportowana notatka Nebula zabiera swoje wideo niezależnie od rozmiaru — duże w folderze obok. Codzienna kopia zapasowa współdzieli obrazy i wideo ze skarbcem, zamiast je kopiować, a zostaje tylko najnowsza. Przed pierwszą zmianą skarbiec jest odkładany w dotychczasowej postaci, a usunięta notatka zabiera swój folder ze sobą.' },
        { title: 'Czarne dziury', text: 'Notatki przechowywane w postaci zaszyfrowanej (AES-256), łącznie z tytułem i obrazami, we własnej sekcji pod notatkami. Czarną dziurę otwiera 6-cyfrowy PIN albo klucz dostępu — odcisk palca, twarz lub PIN komputera, o które system pyta przed oknem Nebula; do PIN-u można dodać podpowiedź. Zamyka się sama po dziesięciu minutach i przy starcie aplikacji. Notatka przeniesiona do niej znika w jawnej postaci ze skarbca i z każdej kopii zapasowej. Jej klucz odzyskiwania, pokazany raz, otwiera ją na innym komputerze albo gdy zapomnisz PIN-u. Czarna dziura trafia do Kosza w całości i zamknięta; tam można ją przywrócić albo usunąć.' },
        { title: 'Otwórz za pomocą Nebula', text: 'Kliknij prawym przyciskiem plik Word, OpenDocument albo Rich Text → Otwórz za pomocą → Nebula, a otworzy się jako nowa notatka — w Nebula, która już działa; sam plik nie jest zmieniany. Nebula proponuje się dla tych plików i nigdy nie ustawia się jako domyślna; wybierz ją jako domyślną, a dostaną fioletową ikonę dokumentu.' },
        { title: 'Czcionki: szukaj, dodawaj i zachowuj', text: 'Menu Czcionka ma wyszukiwanie i + Dodaj czcionkę dla każdej czcionki na twoim komputerze. Słowa skopiowane wewnątrz Nebula zachowują wybraną dla nich czcionkę; słowa wklejone z zewnątrz przyjmują czcionkę pisania notatki. Ostatnio używana czcionka stoi nad + Dodaj czcionkę, z pinezką.' },
        { title: 'Etykiety', text: 'Wpisanie # pokazuje używane etykiety, do wyboru przez ↓ albo Tab. Słowo etykiety można edytować, a gdy w Filtruj według etykiety wybrana jest etykieta, pasek przechodzi przez jej miejsca w otwartej notatce.' },
        { title: 'Foldery i lista notatek', text: '+ Dodaj notatkę na górze każdego otwartego folderu. Kliknięcie notatki lub folderu prawym przyciskiem otwiera ich menu, a zwinięta lista nie pokazuje już kropek nad notatką.' },
        { title: 'Ustawienia i blokada przy otwieraniu', text: 'Ustawienia, obok Pomocy, określają czcionkę, rozmiar tekstu i stronę, z którymi zaczyna nowa notatka, oraz chowają panel AI albo czarne dziury. 6-cyfrowy PIN może blokować Nebula przy każdym otwarciu — obok niego można dodać klucz dostępu — a Plik → Zablokuj Nebula zamyka ją od razu; blokada trzyma aplikację zamkniętą — szyfruje nadal czarna dziura. W menu Czcionka pinezka obok czcionki przenosi ją na górę listy. Na dole Ustawień logo Nebula dostaje twoje własne kolory albo kolory motywu. Contrast dołącza do Matcha jako gotowy profil w Twój własny motyw, a czarna dziura pyta ponownie o PIN, zanim zostanie usunięta albo zanim wyjmiesz z niej notatkę.' },
        { title: 'Drobniejsze rzeczy', text: 'Co nowego mieści się w oknie i przewija, strona nie skacze już na górę po wklejeniu adresu, pasek i strona nie stoją już obok siebie podczas ładowania, a cienka linia oddziela rozmiary strony od przycisków paska.' },
      ],
    },
    tr: {
      headline: 'İki yapıştırma yolu, açılır başlıklar, kendi dilinizde rehber ve yazıya dökülmüş gizliliğiniz.',
      items: [
        { title: 'İki yolla yapıştırma', text: 'Sağ tık Nebula biçiminde ya da özgün biçimiyle yapıştırır — aynısı, sözcüklerin kopyalandığı boyutla — menülerdeki Yapıştır da yeniden çalışıyor. Seçili sözcüklerin üzerinde sağ tık tek bir menüdür: biçim düğmeleri, Kes, Kopyala ve iki yapıştırma.' },
        { title: 'Okunaklı kalan sözcükler', text: 'Yapıştırılan sözcükler artık yapıştırıldıkları temanın mürekkebini taşımıyor; başka bir temada koyu zemin üzerinde siyah kalıyorlardı. Böyle sözcükler içeren notlar, bu sürüm ilk açıldığında düzeltilir.' },
        { title: 'Büyütme, küçültme ve oklar', text: 'Ctrl + ve Ctrl − seçili sözcüklerin ya da imlecin bulunduğu satırın boyutunu değiştirir. --> ve <-- yazınca → ve ← olur.' },
        { title: 'Açılır listeler', text: '/ menüsünden açılır başlıklar, madde işaretli ve numaralı listelerin içinde açılır listeler; ilk harfin önüne tıklamak imleci oraya koyar, başlığın başında Enter üstüne bir satır açar, kendi yazı tipi olan bir notta yazmadan önce Ctrl+B çalışır.' },
        { title: 'Rehber ve bu sayfa kendi dilinizde', text: '“Nebula’ya Hoş Geldiniz” rehberi, içine yazmadığınız sürece Deutsch, Polski ve Türkçe’yi izler; şu an okuduğunuz sayfa da öyle.' },
        { title: 'Gizliliğiniz', text: 'Nebula AI sohbetlerinizi okumaz ve kaydetmez: doğrudan açtığınız hizmete giderler. Bir AI sekmesine sağ tıklayarak oturum verilerini — oturumunu ve çerezlerini — temizleyebilirsiniz; bir sekmeyi silmeden önce artık sorulur. Rehberde bununla ilgili bir bölüm var.' },
        { title: 'Yazım denetimi', text: 'Sözlüğe ekle’nin yanındaki Yoksay, bir sözcüğü uygulamayı kapatana kadar rahat bırakır. İngilizce hem Amerikan hem İngiliz yazımını kabul eder.' },
        { title: 'Kendi temanız', text: 'Temaların sağındaki palet düğmesi bir renk düzenleyicisi açar: zemin, kenar çubuğu, çizgiler, vurgu ve yazı — siz seçtikçe uygulama değişir. Profile ad verip kaydedin; koyu yeşil zemin üzerinde beyaz yazılı Matcha hazır profil olarak oradadır.' },
        { title: 'Resimler istediğiniz yerde', text: 'Metindeki bir resim satırının solunda, ortasında ya da sağında durur; iki resim aynı satırı paylaşabilir — resmin çubuğundan ya da sürükleyerek: bir işaret nereye konacağını gösterir. Bir resim, o satırın bir harfi gibi yazı satırının içinde de durabilir. Kartlar, videolar ve kod blokları da aynı şekilde, başlık satırından sürüklenir.' },
        { title: 'Sayfayı bölen ayırıcı çizgi', text: 'Bir ayırıcı çizgiyi yana çekin, dikleşir: notun onun üstündeki kısmı iki sütuna dönüşür; orada olanların yanında yazmak için bir satır açılır. Genişlikleri değiştirmek için dik ayırıcı çizgiyi sürükleyin; silin, sütunlar yeniden tek akış olur. Bir sütunun üzerine çekilen ayırıcı çizgi o sütunu bir kez daha böler — satıra sığdığı kadar sütun olur; Word, OpenDocument ve Zengin Metin dosyaları sütunları ve her resmin yerini korur. Tek başına bir satıra yazılan dört tire ayırıcı çizgi olur.' },
        { title: 'Tablolar', text: '/table yazın ya da çubuktaki tablo düğmesine basın: sütunları x1, x2…, satırları y1, y2… diye numaralanan bir tablo, bir hesap tablosundaki gibi. Hücreleri seçmek için fareyi üzerlerinden çekin — bir arka plan rengi o zaman arkalarını boyar, Birleştir ve Ayır ise seçimin sağ alt köşesinde durur. Sol alt köşedeki küçük kare, hücreleri sürdürmek için çekilir: hücre kopyalanır, 1, 2’nin ardından 3, 4 gelir. Alttaki + bir satır, sağdaki bir sütun ekler; bir x’in yanındaki çizgi sütununu genişletir, bir y’nin altındaki çizgi satırını yükseltir, köşe ise tabloyu bir resim gibi taşır. Bir hücreye sağ tıklamak üstüne ya da altına satır, soluna ya da sağına sütun ekler. Çubuktaki hizalama düğmeleri bir hücrenin sözcüklerini hizalar. Yeni bir tablo önce boyutunu sorar ve bir tablo sayfasının kenarından asla taşmaz: yer kalmayan yerde sütunları daha dar çizilir.' },
        { title: 'Uyuyan AI sekmeleri', text: 'Açık her sekme 170–300 MB tutuyordu. Sekmeler, siz aksini söylemedikçe uyanık kalır: sekmeye sağ tıklayın → Kullanılmayınca uyusun; yirmi dakika bakılmayınca uykuya geçer ve belleğini geri verir, açtığınızda kaldığı yerde yeniden yüklenir. Geçici bir sohbet ya da yazılıp gönderilmemiş sözler onu yine de uyanık tutar; Uyut ise hemen uyutur.' },
        { title: 'Her nota bir klasör', text: 'Her not artık kendi klasörüdür — dosyası, resimleri ve videoları onun içindedir — resimleri metin olarak taşıyan tek bir dosya değil: bir resim bir kez yazılır, yazarken yalnızca sözler kaydedilir; açık not da resimlerini bellekte tutmak yerine bu dosyalardan gösterir. Nota bırakılan ya da /video ile seçilen video dosyası bu klasöre kopyalanır ve notta oynatılır; kendi çubuğu vardır (on saniye geri ve ileri, hız, tam ekran). Her tür video dosyası kabul edilir; dışa aktarılan Nebula notu videolarını boyutları ne olursa olsun yanında götürür — büyükler yanındaki bir klasörde durur. Günlük yedek resimleri ve videoları kopyalamak yerine kasayla paylaşır ve yalnızca en yenisi tutulur. İlk değişiklikten önce kasanız olduğu gibi bir kenara alınır; silinen not klasörünü de götürür.' },
        { title: 'Kara delikler', text: 'Başlık ve resimler dahil şifreli (AES-256) tutulan notlar, notlarınızın altında kendi bölümünde. Kara delik 6 haneli PIN ile ya da geçiş anahtarıyla — parmak iziniz, yüzünüz ya da bilgisayarın kendi PIN’i; Nebula’nın önünde sorulur — açılır; PIN’le birlikte bir ipucu saklanabilir. On dakika sonra ve uygulama açıldığında kendiliğinden kilitlenir. İçine taşınan notun düz hali kasadan ve her yedekten silinir. Bir kez gösterilen kurtarma anahtarı, onu başka bir bilgisayarda ya da PIN unutulduğunda açar. Bir kara delik bütünüyle ve kilitli olarak Çöp kutusuna gider; orada geri yüklenir ya da silinir.' },
        { title: 'Nebula ile aç', text: 'Bir Word, OpenDocument ya da Zengin Metin dosyasına sağ tıklayın → Birlikte aç → Nebula; zaten çalışan Nebula’da yeni bir not olarak açılır, dosyanın kendisi değiştirilmez. Nebula bu dosyalar için kendini önerir, kendini asla varsayılan yapmaz; onu varsayılan olarak siz seçerseniz dosyalar mor bir belge simgesi taşır.' },
        { title: 'Yazı tipleri: ara, ekle ve koru', text: 'Yazı tipi menüsünde bir arama ve bilgisayarınızdaki her yazı tipi için + Yazı tipi ekle var. Nebula içinde kopyalanan sözcükler kendileri için seçilmiş yazı tipini korur; dışarıdan yapıştırılanlar notun yazma yazı tipini alır. Son kullanılan yazı tipi + Yazı tipi ekle’nin üstünde durur, bir raptiye ile.' },
        { title: 'Etiketler', text: '# yazınca kullanılan etiketler listelenir; ↓ ya da Tab ile seçilir. Bir etiketin sözcüğü düzenlenebilir; Etikete göre filtrele’de bir etiket seçiliyken de bir çubuk, açık nottaki yerlerini tek tek gezer.' },
        { title: 'Klasörler ve not listesi', text: 'Her açık klasörün en üstünde + Not ekle. Bir nota ya da klasöre sağ tık menüsünü açar; katlı liste de artık notun üzerinde üç noktayı göstermez.' },
        { title: 'Ayarlar ve açılışta kilit', text: 'Yardım’ın yanındaki Ayarlar, yeni bir notun başladığı yazı tipini, yazı boyutunu ve sayfayı belirler; yapay zekâ panelini ya da kara delikleri ortadan kaldırır. 6 haneli bir PIN Nebula’yı her açılışta kilitleyebilir, yanına bir geçiş anahtarı da eklenebilir; Dosya → Nebula’yı kilitle onu hemen kapatır. Kilit uygulamayı kapalı tutar — şifreleyen yine kara deliktir. Yazı tipi menüsünde bir yazı tipinin yanındaki raptiye onu listenin en üstüne alır. Ayarlar’ın en altında Nebula logosu kendi renklerinizi ya da bir temanın renklerini alır. Contrast, Kendi temanız’da Matcha’nın yanına hazır profil olarak gelir; bir kara delik de silinmeden ya da içinden not çıkarılmadan önce PIN’ini yeniden sorar.' },
        { title: 'Küçük şeyler', text: 'Yenilikler pencereye sığar ve kayar, bir web adresi yapıştırdıktan sonra sayfa artık en üste sıçramaz, uygulama yüklenirken çubuk ile sayfa yan yana durmaz ve ince bir çizgi sayfa boyutlarını çubuğun düğmelerinden ayırır.' },
      ],
    },
  },
};

/**
 * An entry as `lang` reads it: the translation when there is one that matches
 * the English entry item for item, the English otherwise.
 */
export function notesIn(entry, lang, i18n = RELEASE_NOTES_I18N) {
  const local = entry && i18n[entry.version]?.[lang];
  if (!local || local.items?.length !== entry.items.length) return entry;
  return { ...entry, headline: local.headline, items: local.items };
}

export function notesFor(version, all = RELEASE_NOTES) {
  if (!version) return null;
  const key = String(version).replace(/^v/, '');
  const entry = all[key];
  return entry && entry.items?.length ? { version: key, ...entry } : null;
}

/**
 * Whether to open the dialog.
 *
 * `seen` is the version this vault last acknowledged. No stored value means an
 * install that predates this feature — which is an update, so it shows.
 */
export function shouldShow(version, seen, all = RELEASE_NOTES) {
  if (!notesFor(version, all)) return false;
  return String(seen ?? '') !== String(version).replace(/^v/, '');
}
