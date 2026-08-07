/**
 * User manual content.
 *
 * Filtered by exactly the permission model the sidebar uses, so a reader never
 * sees instructions for a page they cannot open. Filtering happens twice:
 *
 *   - section level, on `module` + 'navigate', matching Sidebar.canNavigate
 *   - task level, on `action`, so a reader with read-only rights is not taught
 *     how to create or delete something the buttons will not let them do
 *
 * Sections with `module: null` are always shown: signing in, your own account,
 * and what to do when something goes wrong apply to everyone.
 */

export interface ManualStep {
  /** One instruction. Imperative, one action, names what the reader clicks. */
  do: string;
  /** What the reader should see afterwards, so they can tell it worked. */
  see?: string;
  note?: string;
  warn?: string;
}

export interface ManualTask {
  id: string;
  title: string;
  /** When you would do this, in plain language. */
  when: string;
  /** Permission action needed. Undefined means anyone who can open the page. */
  action?: 'create' | 'read' | 'update' | 'delete';
  steps: ManualStep[];
}

export interface ManualFaq {
  q: string;
  a: string;
}

export interface ManualSection {
  id: string;
  /** Module key used for the navigate check. null means always visible. */
  module: string | null;
  title: string;
  /** Icon key, resolved to a component in the page. */
  icon: string;
  /** One sentence a non-technical reader understands. */
  summary: string;
  tasks: ManualTask[];
  faqs?: ManualFaq[];
}

export const MANUAL_SECTIONS: ManualSection[] = [
  // ---------------------------------------------------------------- always on
  {
    id: 'start',
    module: null,
    icon: 'start',
    title: 'Start here',
    summary: 'What this system is, and the three things worth knowing before you touch anything.',
    tasks: [
      {
        id: 'start-what',
        title: 'Understand what you are looking at',
        when: 'Read this once, on your first day.',
        steps: [
          {
            do: 'Look at the dark bar down the left side of the screen. That is the menu.',
            see: 'A list of pages: things like Dashboard, Council Records, Meetings.',
          },
          {
            do: 'Click any item in that menu to open it.',
            see: 'The page opens on the right. The menu stays where it is.',
            note: 'The menu only lists pages you are allowed to open. If a colleague has more items than you, that is on purpose, not a fault.',
          },
          {
            do: 'Find your name at the bottom of the menu. Click it.',
            see: 'A small panel with your profile and the Sign Out button.',
          },
        ],
      },
      {
        id: 'start-safe',
        title: 'Know what is safe to click',
        when: 'Before you start exploring on your own.',
        steps: [
          {
            do: 'Click freely on menu items and on anything that only reads information.',
            note: 'Opening a page never changes anything. You cannot break the system by looking.',
          },
          {
            do: 'Take care with red buttons and anything labelled Delete.',
            warn: 'Deleting is permanent. There is no undo. If you are not certain, ask before you confirm.',
          },
          {
            do: 'When a box appears asking you to confirm, read the sentence in it before clicking.',
            see: 'The confirmation names exactly what will happen and to what.',
          },
        ],
      },
      {
        id: 'start-saving',
        title: 'Know when your work is saved',
        when: 'Every time you fill in a form.',
        steps: [
          {
            do: 'Fill in the boxes, then click the Save button.',
            see: 'The window closes and your entry appears in the list behind it.',
          },
          {
            do: 'If a red message appears instead, read it. Your work is still in the boxes.',
            see: 'The window stays open so you can correct the problem and save again.',
            note: 'Nothing is saved until the window closes. Closing it with the X discards what you typed.',
          },
        ],
      },
    ],
    faqs: [
      {
        q: 'I cannot see a page my colleague can see. Is something broken?',
        a: 'No. The menu only shows what your role allows. If you need access to something, ask an administrator to add the permission to your role.',
      },
      {
        q: 'Do I need to save before I sign out?',
        a: 'Yes. Anything typed into a form but not saved is lost when you leave the page or sign out.',
      },
    ],
  },
  {
    id: 'signing-in',
    module: null,
    icon: 'lock',
    title: 'Signing in and passwords',
    summary: 'Getting into the system, and what to do when you cannot.',
    tasks: [
      {
        id: 'sign-in',
        title: 'Sign in',
        when: 'Every time you open the system.',
        steps: [
          {
            do: 'Type your username or your email address in the first box.',
            note: 'Either works. Use whichever you remember.',
          },
          { do: 'Type your password in the second box.', note: 'Click the eye icon on the right of the box to check what you typed.' },
          { do: 'Click Sign In.', see: 'The first page you are allowed to open.' },
          {
            do: 'If you see "Invalid login credentials", check for typing mistakes and try again.',
            note: 'That message means the username or the password did not match. It does not mean your account is missing.',
          },
        ],
      },
      {
        id: 'forgot-password',
        title: 'Reset a password you have forgotten',
        when: 'You cannot sign in and you are sure the username is right.',
        steps: [
          { do: 'On the sign-in screen, click "Forgot your password?".' },
          { do: 'Type your email address and click Send Reset Link.' },
          {
            do: 'Open your email and click the link in the message.',
            note: 'Check your spam folder if it has not arrived within a few minutes.',
          },
          { do: 'Type a new password twice, then save.', see: 'You are returned to the system, signed in.' },
        ],
      },
      {
        id: 'change-password',
        title: 'Change a password you still know',
        when: 'Regularly, and immediately if you think someone else has learned it.',
        steps: [
          { do: 'Click your name at the bottom of the menu.' },
          { do: 'Choose Change Password.' },
          { do: 'Type your new password, then confirm it.', note: 'Use at least 8 characters. Longer is better than complicated.' },
          { do: 'Click Save.' },
        ],
      },
      {
        id: 'sign-out',
        title: 'Sign out',
        when: 'Whenever you leave a shared or public computer.',
        steps: [
          { do: 'Click your name at the bottom of the menu.' },
          { do: 'Click Sign Out.', see: 'The button shows "Signing out…" briefly, then the sign-in screen appears.' },
          {
            do: 'If the screen does not change after a few seconds, close the browser tab.',
            note: 'Closing the tab also ends your session on that computer.',
          },
        ],
      },
    ],
    faqs: [
      {
        q: 'The system signed me out on its own. Why?',
        a: 'It signs you out after a period of inactivity, and immediately if an administrator deactivates your account. Sign in again; nothing you saved is lost.',
      },
      {
        q: 'Can I share my login with a colleague?',
        a: 'No. Every action is recorded against the account that performed it, so a shared login makes the record wrong and leaves you answerable for someone else\'s work.',
      },
    ],
  },

  // ------------------------------------------------------------ module-gated
  {
    id: 'dashboard',
    module: 'dashboard',
    icon: 'dashboard',
    title: 'Dashboard',
    summary: 'The overview screen. Numbers and recent activity at a glance.',
    tasks: [
      {
        id: 'dashboard-read',
        title: 'Read the dashboard',
        when: 'At the start of your day, to see what has changed.',
        steps: [
          { do: 'Open Dashboard from the menu.' },
          { do: 'Look at the cards along the top. Each is a running total.', see: 'Counts such as members, meetings and records.' },
          { do: 'Scroll down for recent activity.', see: 'The newest entries, most recent first.' },
          {
            do: 'Click any item in the activity list to open it.',
            note: 'If nothing opens, you do not have permission for that page. Nothing is broken.',
          },
        ],
      },
    ],
  },
  {
    id: 'records',
    module: 'council_records',
    icon: 'records',
    title: 'Council Records',
    summary: 'The permanent written record: resolutions, minutes and decisions.',
    tasks: [
      {
        id: 'records-find',
        title: 'Find a record',
        when: 'You need to look something up.',
        steps: [
          { do: 'Open Council Records from the menu.' },
          { do: 'Type part of the title into the search box.', see: 'The list narrows as you type.' },
          { do: 'Use the status filter to show only drafts or only published records.' },
          { do: 'Click a record to read it in full.' },
        ],
      },
      {
        id: 'records-create',
        title: 'Add a new record',
        action: 'create',
        when: 'A decision has been made that needs writing down.',
        steps: [
          { do: 'Click the New Record button at the top right.', see: 'A window with empty boxes.' },
          { do: 'Type a clear title.', note: 'Write the title someone else would search for in a year. "Budget approval March 2026" beats "Meeting notes".' },
          { do: 'Write the content.' },
          { do: 'Choose the record type and the status.', note: 'Leave the status on Draft while you are still working. Change it to Published when it is final.' },
          { do: 'Click Save.', see: 'The window closes and your record appears at the top of the list.' },
          { do: 'If a red message appears, read it and fix what it names, then Save again.', note: 'Your typing is still there. Nothing is lost.' },
        ],
      },
      {
        id: 'records-edit',
        title: 'Change an existing record',
        action: 'update',
        when: 'Something was recorded incorrectly.',
        steps: [
          { do: 'Find the record in the list.' },
          { do: 'Click the edit (pencil) icon on its row.' },
          { do: 'Change what needs changing.' },
          { do: 'Click Save.' },
          { do: 'Every change is recorded against your name in the Audit Logs.', note: 'That is normal and expected. It protects you as much as anyone.' },
        ],
      },
      {
        id: 'records-delete',
        title: 'Delete a record',
        action: 'delete',
        when: 'Rarely. A record created by mistake, not one you disagree with.',
        steps: [
          { do: 'Find the record and click the delete (bin) icon.' },
          { do: 'Read the confirmation box carefully.', warn: 'Deleting is permanent. There is no undo and no recycle bin.' },
          { do: 'Click Delete only if the name in the box is the record you meant.' },
        ],
      },
    ],
    faqs: [
      {
        q: 'Should I delete an out-of-date record?',
        a: 'Usually no. Edit it, or add a newer record that supersedes it. The history is the point of keeping records.',
      },
    ],
  },
  {
    id: 'meetings',
    module: 'meetings',
    icon: 'meetings',
    title: 'Meetings',
    summary: 'Scheduling meetings and keeping their notes.',
    tasks: [
      {
        id: 'meetings-view',
        title: 'See what is scheduled',
        when: 'Checking what is coming up.',
        steps: [
          { do: 'Open Meetings from the menu.' },
          { do: 'Read down the list. Times are shown in local time.' },
          { do: 'Click a meeting to see its full details and notes.' },
        ],
      },
      {
        id: 'meetings-create',
        title: 'Schedule a meeting',
        action: 'create',
        when: 'A new meeting has been agreed.',
        steps: [
          { do: 'Click New Meeting.' },
          { do: 'Type the title and pick the date and time.', note: 'Enter the local time. The system stores it correctly for everyone.' },
          { do: 'Add the location and a short description.' },
          { do: 'Click Save.', see: 'The meeting appears in the list.' },
        ],
      },
      {
        id: 'meetings-notes',
        title: 'Add notes after a meeting',
        action: 'update',
        when: 'The meeting has finished.',
        steps: [
          { do: 'Find the meeting and click the edit icon.' },
          { do: 'Write what was decided in the Notes box.', note: 'Decisions and who is doing what. Not a transcript.' },
          { do: 'Change the status to Completed.' },
          { do: 'Click Save.' },
        ],
      },
    ],
  },
  {
    id: 'chatbot',
    module: 'chatbot',
    icon: 'chatbot',
    title: 'Chatbot',
    summary: 'Ask questions and get answers from the connected assistant.',
    tasks: [
      {
        id: 'chatbot-send',
        title: 'Ask a question',
        when: 'Any time you want an answer without asking a person.',
        steps: [
          {
            do: 'Open Chatbot from the menu, or click the round chat button in the bottom right of any page.',
            see: 'A conversation panel.',
          },
          { do: 'Check the small dot at the top of the panel.', see: 'Green means connected. Amber means no assistant is connected yet and nobody will answer.' },
          { do: 'Type your question and press Enter.' },
          { do: 'Wait for the reply.', note: 'A reply can take several seconds. Sending again just asks twice.' },
        ],
      },
      {
        id: 'chatbot-history',
        title: 'Go back to an earlier conversation',
        when: 'You want to re-read an answer.',
        steps: [
          { do: 'Open the Chatbot page.' },
          { do: 'Pick a conversation from the list on the left.', see: 'Its messages load on the right.' },
        ],
      },
      {
        id: 'chatbot-delete',
        title: 'Delete conversations',
        action: 'delete',
        when: 'Clearing out old or test conversations.',
        steps: [
          { do: 'Open the Chatbot page.' },
          { do: 'To remove one, click the bin icon on its row.' },
          { do: 'To remove several, click Select, tick the ones you want, then click Delete.', note: 'The counter tells you how many are ticked before you confirm.' },
          { do: 'Confirm.', warn: 'The messages inside a deleted conversation go with it, permanently.' },
        ],
      },
    ],
    faqs: [
      {
        q: 'The dot is amber and nothing answers me.',
        a: 'No assistant is connected. Someone with Chatbot Setup access needs to connect one. Your messages are still saved.',
      },
    ],
  },
  {
    id: 'notifications',
    module: 'notifications',
    icon: 'notifications',
    title: 'Notifications',
    summary: 'Messages the system has sent you.',
    tasks: [
      {
        id: 'notifications-read',
        title: 'Read and clear notifications',
        when: 'The red number appears next to Notifications in the menu.',
        steps: [
          { do: 'Open Notifications from the menu.', see: 'Unread items are highlighted.' },
          { do: 'Click one to read it and mark it as read.', see: 'The red number goes down.' },
          { do: 'Use Mark all as read to clear the count in one go.' },
        ],
      },
    ],
  },
  {
    id: 'announcements',
    module: 'announcements',
    icon: 'announcements',
    title: 'Announcements',
    summary: 'Notices published to the whole council.',
    tasks: [
      {
        id: 'announcements-create',
        title: 'Publish an announcement',
        action: 'create',
        when: 'Something needs to reach everyone.',
        steps: [
          { do: 'Open Configuration, then Announcements.' },
          { do: 'Click New Announcement.' },
          { do: 'Type the title and the message.', note: 'Put the important part in the first sentence. Many people read no further.' },
          { do: 'Choose a priority.', note: 'Keep High for things that are genuinely urgent, or people stop noticing it.' },
          { do: 'Turn Published on when you are ready for people to see it.', note: 'Leave it off to save a draft.' },
          { do: 'Click Save.' },
        ],
      },
      {
        id: 'announcements-edit',
        title: 'Correct or withdraw an announcement',
        action: 'update',
        when: 'You published something wrong.',
        steps: [
          { do: 'Find it in the list and click the edit icon.' },
          { do: 'Fix the wording, or turn Published off to hide it again.' },
          { do: 'Click Save.' },
        ],
      },
    ],
  },
  {
    id: 'members',
    module: 'members',
    icon: 'members',
    title: 'Members',
    summary: 'The people who can sign in, and what each of them is allowed to do.',
    tasks: [
      {
        id: 'members-find',
        title: 'Find a member',
        when: 'Checking someone\'s details or access.',
        steps: [
          { do: 'Open Configuration, then Members.' },
          { do: 'Type a name or email into the search box.' },
          { do: 'Read across the row for their role and whether they are active.' },
        ],
      },
      {
        id: 'members-create',
        title: 'Add a new member',
        action: 'create',
        when: 'Someone new needs access.',
        steps: [
          { do: 'Click Add Member.' },
          { do: 'Type their full name and email address.', note: 'The email must be one they can actually open. It is both their login and where their welcome message goes.' },
          { do: 'Set a first password of at least 8 characters.', note: 'They can change it once they are in.' },
          { do: 'Choose their role.', note: 'The role decides what they can see. If you are unsure, pick the least access that lets them do their job. You can widen it later.' },
          { do: 'Click Save.', see: 'They appear in the list and receive a welcome email with their details.' },
          {
            do: 'If a red message appears, read it and fix what it names.',
            note: 'The usual cause is an email address already in use.',
          },
        ],
      },
      {
        id: 'members-edit',
        title: 'Change a member\'s details or password',
        action: 'update',
        when: 'Someone changes role, or needs their password reset for them.',
        steps: [
          { do: 'Find them in the list and click the edit icon.' },
          { do: 'Change the name, email or role as needed.' },
          { do: 'To reset their password, type a new one in the password box.', note: 'Leave the password box empty to keep their current password. Filling it in replaces it immediately.' },
          { do: 'Click Save.', see: 'They receive an email telling them their account was updated.' },
        ],
      },
      {
        id: 'members-deactivate',
        title: 'Remove someone\'s access',
        action: 'update',
        when: 'Someone leaves, or should not be signing in for now.',
        steps: [
          { do: 'Find them and switch Active off, then Save.', note: 'Prefer this to deleting. Their name stays attached to the records and decisions they made.' },
          { do: 'They are signed out immediately and cannot sign back in.', see: 'Their row shows as inactive.' },
          { do: 'Switch Active back on to restore access.' },
        ],
      },
    ],
    faqs: [
      {
        q: 'Should I delete someone who has left, or deactivate them?',
        a: 'Deactivate. Deleting breaks the link between them and the work they did, which makes your records harder to trust later.',
      },
      {
        q: 'I changed someone\'s password but they still cannot sign in.',
        a: 'Check you clicked Save and saw no red message, and that they are using the email shown on their row. Also check Active is on.',
      },
    ],
  },
  {
    id: 'audit',
    module: 'audit_logs',
    icon: 'audit',
    title: 'Audit Logs',
    summary: 'A permanent list of who did what, and when.',
    tasks: [
      {
        id: 'audit-read',
        title: 'Look up what happened',
        when: 'Something changed and you need to know who changed it.',
        steps: [
          { do: 'Open Configuration, then Audit Logs.', see: 'The newest entries first.' },
          { do: 'Filter by person, by action, or by date to narrow it down.' },
          { do: 'Read the row: who, what, which item, and when.' },
        ],
      },
    ],
    faqs: [
      {
        q: 'Can I edit or delete an audit entry?',
        a: 'No, and that is deliberate. An audit log you can edit is worth nothing. Entries can only be added.',
      },
    ],
  },
  {
    id: 'roles',
    module: 'roles',
    icon: 'roles',
    title: 'Roles & Permissions',
    summary: 'Who is allowed to see and do what. The most consequential page in the system.',
    tasks: [
      {
        id: 'roles-understand',
        title: 'Understand how access works',
        when: 'Before you change anything here.',
        steps: [
          { do: 'Every member has one role. The role holds the permissions. Nobody has permissions of their own.' },
          { do: 'Changing a role changes it for everyone who has that role, immediately.', warn: 'This is the mistake people make. Check who holds a role before editing it.' },
          {
            do: 'Read the two tabs. Navigation decides which menu items appear. Access decides what can be done on the page.',
            note: 'Someone needs Navigation to open a page at all. Access without Navigation is useless.',
          },
        ],
      },
      {
        id: 'roles-edit',
        title: 'Change what a role can do',
        action: 'update',
        when: 'A group of people needs more or less access.',
        steps: [
          { do: 'Open Configuration, then Roles & Permissions.' },
          { do: 'Pick the role from the list on the left.', see: 'Its current permissions, ticked.' },
          {
            do: 'Before changing anything, check the ticks match what you expect.',
            warn: 'If every box looks unticked and you know that is wrong, stop. Do not save. Reload the page first. Saving would strip the role.',
          },
          { do: 'Tick or untick the permissions you want to change.' },
          { do: 'Click Save.', see: 'A confirmation, and the list refreshes.' },
          { do: 'If a red message appears, read it. Nothing was changed.' },
        ],
      },
      {
        id: 'roles-create',
        title: 'Create a new role',
        action: 'create',
        when: 'A group of people needs a combination of access that no existing role gives.',
        steps: [
          { do: 'Click New Role.' },
          { do: 'Give it a short name and a display name people will recognise.' },
          { do: 'Click Save, then tick its permissions and Save again.', note: 'A new role starts with no permissions at all. Nobody assigned to it can do anything until you grant some.' },
        ],
      },
    ],
    faqs: [
      {
        q: 'I removed my own permission by accident. What now?',
        a: 'Ask a Super Admin to restore it. The system refuses to let you remove your own ability to manage roles, but other permissions you can remove from yourself.',
      },
      {
        q: 'Someone says a page vanished from their menu.',
        a: 'Their role lost its Navigation permission for that page. Tick it again here and it comes back for them without them signing out.',
      },
    ],
  },
  {
    id: 'chatbot-setup',
    module: 'chatbot_setup',
    icon: 'webhook',
    title: 'Chatbot Setup',
    summary: 'Connecting the assistant that answers messages on the Chatbot page.',
    tasks: [
      {
        id: 'chatbot-setup-connect',
        title: 'Connect or change the assistant',
        action: 'update',
        when: 'Setting the chatbot up, or moving it to a new endpoint.',
        steps: [
          { do: 'Open Configuration, then Chatbot Setup.' },
          { do: 'Enter the webhook address supplied by whoever runs the assistant.' },
          { do: 'Click Test to check it responds.', see: 'A success message, or an explanation of what failed.' },
          { do: 'Turn it active and Save.', see: 'The dot on the Chatbot page turns green.' },
        ],
      },
      {
        id: 'chatbot-setup-check',
        title: 'Check why the chatbot is not replying',
        when: 'People report they get no answers.',
        steps: [
          { do: 'Open Chatbot Setup and look at the recent activity list.', see: 'Each attempt, with the response and how long it took.' },
          { do: 'Look for failures. The message usually names the cause.' },
          { do: 'Click Test to try again now.' },
        ],
      },
    ],
  },
  {
    id: 'smtp',
    module: 'smtp_settings',
    icon: 'smtp',
    title: 'Email Settings',
    summary: 'The mail account the system uses to send welcome and notification emails.',
    tasks: [
      {
        id: 'smtp-configure',
        title: 'Set up outgoing email',
        action: 'update',
        when: 'Emails are not being delivered, or you are moving to a new mail account.',
        steps: [
          { do: 'Open Configuration, then SMTP Settings.' },
          { do: 'Fill in the host, port, username and password from your email provider.', note: 'The page lists the usual settings for Gmail and Office 365 on the right.' },
          { do: 'Fill in the sender name and address recipients will see.' },
          { do: 'Click Test Connection.', see: 'A test message is sent to the sender address. Check it arrived.' },
          { do: 'Click Save once the test passes.', warn: 'Saving settings that fail the test means welcome emails stop reaching new members, silently.' },
        ],
      },
    ],
    faqs: [
      {
        q: 'The test fails with an authentication error on Office 365.',
        a: 'The page prints the exact steps for that case, including enabling Authenticated SMTP and using an App Password if multi-factor authentication is on.',
      },
    ],
  },

  // ---------------------------------------------------------------- always on
  {
    id: 'account',
    module: null,
    icon: 'user',
    title: 'Your account',
    summary: 'Your own details, which you can always change regardless of your role.',
    tasks: [
      {
        id: 'account-profile',
        title: 'Update your own details',
        when: 'Your name or contact details change.',
        steps: [
          { do: 'Click your name at the bottom of the menu, then Profile.' },
          { do: 'Change what you need to change.' },
          { do: 'Click Save.' },
          { do: 'To change your role, ask an administrator.', note: 'Nobody can widen their own access. That is a safeguard, not a fault.' },
        ],
      },
    ],
  },
  {
    id: 'trouble',
    module: null,
    icon: 'help',
    title: 'When something goes wrong',
    summary: 'The messages you might see, what each one means, and what to do.',
    tasks: [
      {
        id: 'trouble-red',
        title: 'A red bar appeared at the top of the screen',
        when: 'Anywhere in the system.',
        steps: [
          { do: 'Read it. It names what failed.', note: 'Red means the system reached the database and the database refused. It usually means a permission you do not have.' },
          { do: 'If it mentions permission, ask an administrator for the access you need.' },
          { do: 'Otherwise note the wording and send it to whoever supports this system.', note: 'The exact words matter. A screenshot is ideal.' },
        ],
      },
      {
        id: 'trouble-amber',
        title: 'An amber bar appeared about the connection',
        when: 'Your internet has dropped or the server is briefly unreachable.',
        steps: [
          { do: 'Wait a few seconds. It clears itself once the connection returns.' },
          { do: 'If it stays, check your own internet connection first.' },
          { do: 'Reload the page.' },
        ],
      },
      {
        id: 'trouble-noaccess',
        title: 'The page says "No access"',
        when: 'You opened a page your role does not allow.',
        steps: [
          { do: 'This is expected, not a fault.' },
          { do: 'Pick a different page from the menu.' },
          { do: 'If you believe you should have access, ask an administrator to add it to your role.' },
        ],
      },
      {
        id: 'trouble-stuck',
        title: 'The screen is stuck loading, or says it could not load your account',
        when: 'Right after signing in.',
        steps: [
          { do: 'Click Try again if the button is offered.' },
          { do: 'If that does not help, click Sign out and sign in again.' },
          { do: 'If it keeps happening, report it with the message shown on screen.' },
        ],
      },
      {
        id: 'trouble-missing',
        title: 'Something I saved is not there',
        when: 'After adding or editing something.',
        steps: [
          { do: 'Reload the page first. Most often it is there.' },
          { do: 'Think back to whether the window closed by itself when you clicked Save.', note: 'If it closed, it saved. If it stayed open with a red message, it did not.' },
          { do: 'Check the Audit Logs if you have access. Every successful change is recorded there.' },
        ],
      },
    ],
  },
];

/** Matches Sidebar.canNavigate so the manual can never offer more than the menu. */
export function visibleSections(
  isSuperAdmin: boolean,
  hasPermission: (module: string, action: string) => boolean,
): ManualSection[] {
  return MANUAL_SECTIONS
    .filter((s) => s.module === null || isSuperAdmin || hasPermission(s.module, 'navigate'))
    .map((s) => ({
      ...s,
      // A reader with read-only rights should not be walked through creating or
      // deleting things the page will not let them do.
      tasks: s.tasks.filter(
        (t) => !t.action || s.module === null || isSuperAdmin || hasPermission(s.module, t.action),
      ),
    }))
    .filter((s) => s.tasks.length > 0);
}
