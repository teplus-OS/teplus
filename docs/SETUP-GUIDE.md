Markdown copy of docs/teplus-setup-guide.pdf, for AI assistants and anyone who prefers text. The PDF is the version people receive.

# teplus · setup guide

A free, open source coverage and relationship tool. It runs on accounts you own. Your data sits in your own database, and nobody else has a login to it.

## 01 / What you need

- **Time.** About an hour. Setup: about an hour, 20 minutes of it is you. Then 30 to 60 minutes of your decisions for people and companies. Regular chat: add about 30 minutes.
- **Database.** Supabase account. Free tier. This is where your data lives.
- **Hosting.** Vercel account. Free tier. Gives you a URL you can bookmark.
- **Assistant.** The AI of your choice. Best: an assistant that can run commands. Claude Code, Cowork with your computer linked, or ChatGPT agent mode. Works: a regular chat, you paste a few commands. See the last page.

## 02 / What will happen

1. **Ten minutes in Supabase first.** Page 2 tells you exactly what to click.
2. **Paste the prompt into your AI.** It reads the Teplus repository and takes it from there.
3. **It runs one setup script.** `setup.sh` does the technical steps in one go, every step explained before you do it.
4. **Teplus goes live at your own URL.** Sign in, then your people and companies.

The prompt, copy this:

> Deploy this for me: github.com/teplus-OS/teplus. I'm not technical. Set up Teplus step by step, explain each step before I do it, and don't move on until it works. Host it on Vercel's free tier so I get a URL I can bookmark. Then turn on company coverage, then help me load my contacts and build my coverage list, following docs/SETUP-GUIDE.md in the repo.

Or attach this PDF to the chat and say: follow this guide, here are my details.

# Ten minutes in Supabase, then hand it over.

## 03 / Four steps in the Supabase dashboard

1. **Create a project.** At supabase.com. Save the database password somewhere safe; Teplus never needs it again.
2. **Run the schema.** SQL editor → New query. Paste all of `supabase/schema.sql`, press Run. It creates the tables and the security policies (RLS) in one go; there is nothing else to click.
3. **Lock down sign-ups.** Authentication → Sign In / Providers: turn off "Allow new users to sign up"; under the Email provider set minimum password length to 12. Press Save at the bottom.
4. **Create your login.** Authentication → Users → Add user → Create new user. Tick Auto Confirm User. This email and password are your Teplus login.

## 04 / Two tokens for your AI

1. **Supabase token.** supabase.com/dashboard/account/tokens → Generate new token. Name it `teplus-setup`.
2. **Vercel token.** vercel.com/account/tokens → Create. Name it `teplus-setup`. Delete both tokens when setup is done.

Using a regular chat instead? Skip the tokens. The regular chat path below logs you in through the browser.

Have connectors? If your assistant has Supabase and Vercel connectors (Claude's Cowork does), connect them to the account you're using for Teplus and skip the tokens. Your AI can then create the project and run the schema itself; it will tell you which clicks are still yours.

## 05 / What to give your AI

- **The project ref.** The short code in your project's URL.
- **The Project URL.** Project Settings → Data API.
- **The publishable key.** Project Settings → API keys.
- **The Supabase token.** The one you just made.
- **The Vercel token.** The one you just made.

**Never give it the database password or the secret key. Teplus never uses them.**

# Bring your people, keep your habits.

## 06 / 30 to 60 minutes of your decisions

Already tracking in a spreadsheet? Upload it to your AI in the same chat. It maps your columns, cleans up duplicates, and loads everything in.

> Here's my relationship tracker [attach the file]. Map my contacts, firms, and last-touch dates into Teplus, tell me what didn't map, and load it in.

## 07 / Get your LinkedIn export

LinkedIn will give you a spreadsheet of every connection: name, company, title, and the date you connected.

1. **Open your settings.** Click your photo, top right, then **Settings & Privacy**.
2. **Data privacy → Download your data.** Choose **Data privacy**, then **Download your data**.
3. **Choose the larger archive.** Pick **Download larger data archive**, then **Request archive**.
4. **Wait for the email, then unzip it.** It can take about 24 hours. Inside the .zip, find `Connections.csv`.

(screenshot in the PDF) (screenshot in the PDF) (screenshot in the PDF)

# A thousand connections in, a working list out.

## 08 / Three prompts

Run these three prompts in order, in the same chat.

**Prompt 1 — Cut the list.** Everyone loads. Only the keepers go in your daily list; the rest are archived, not deleted.

> Here's my LinkedIn export [attach the file]. I work in [your seat]. Load everyone into my Teplus. Mark the people who belong in a relationship system as active: clients, prospects, referral sources, people I'd actually call. Archive the rest so they stay out of my daily list but still show up if they work at a company I cover. Show me the borderline calls all at once and let me decide.

**Prompt 2 — Score who's left.** This sets how often Teplus expects you to touch each person: key about every 90 days, standard 150, annual 300.

> Score the keepers: key, standard, or annual. Suggest a score for each from title and firm, apply them, and show me only the ones you're unsure about so I can decide those.

**Prompt 3 — Spread the cadence.** This staggers everyone's start date so touches don't pile up in week one. Even, not random: a random draw can put 17 people in one week.

> Set touch cadences by importance: key every 90 days, standard 150, annual 300. Spread each group's starting dates evenly across its window, not at random, so about the same number of people comes due each week. Load everyone into my Teplus and show me the weekly counts for the next quarter.

Know the real last-contact date for someone? Tell your AI to use it instead of a randomized one. Real beats random.

# Your companies, watching themselves.

## 09 / What the tab shows

Updates on every company you cover, pulled from public sources. People you already know there. A reach out flag with a plain reason why.

## 10 / Turn on coverage

The setup script already deployed coverage and scheduled it. It needs one thing from you: your email, entered in the Company coverage card on the Home tab. Teplus sends it to the SEC, as their policy requires. If you skipped coverage, tell your AI: turn on company coverage for my Teplus.

## 11 / Build your list

Two ways to start. Use either one, or both.

Already have a list, copy this:

> Here is the list of companies I cover [paste]. Find each one's website domain, sector and stage, show me the table, then load them into my Teplus.

Starting from scratch, copy this:

> Build me a list of companies to cover: [Series A to C fintech in New York, 50 to 300 people]. Show me the whole list with the website, sector and stage, let me keep or drop each, then load the keepers into my Teplus.

Headcount is an estimate. Free public sources can't verify company size, so your AI builds the list from funding roundups and news, and size is its best guess.

## 12 / What reach out means

| Trigger | Window | What you'll see |
| --- | --- | --- |
| Raised money | 30 days | "Filed a Form D 6 days ago" |
| Leadership change | 45 days | "New CFO announced 12 days ago" |
| Investors page goes live | 60 days | "Investors page went live" |
| Finance or ERP hiring | 60 days | "Hiring a VP Finance" |

## 13 / Free plan limits

- About 300 companies is comfortable on the free plan. Checks run in batches of 8 every 15 minutes, so each company refreshes a few times a day.
- If you skipped company coverage, open Teplus at least once a week so the free project stays awake.

# Ten seconds a touch, forever warm.

## 14 / Best practices

- **Work the list, don't rebuild it.** Let the daily queue drive.
- **Log touches as they happen.** It keeps the who's-going-cold math honest.
- **Let reality re-score people.** Two weeks of real use fixes most import mistakes.
- **Make it yours.** Ask your AI to add a field or change a rule any time.

## 15 / It's yours

Change anything with a prompt, then try it. Send good changes to r@agran.co.

To update, tell your AI: "update my Teplus to the latest version from the repo." Your data stays put, since it lives in your database, not the app file.

## 16 / If your AI can read your email

Connected Gmail or Outlook to Claude or ChatGPT? Then one prompt a week keeps Teplus current. It works because Teplus is a plain database your AI can write to.

> Read my sent mail since last Monday. For each person I actually wrote to who is in my Teplus, log a touch with the date and a one line summary. Show me the list before you write anything.

First time, use a longer window to backfill history. Needs an assistant with email access and access to your Teplus database.

## 17 / Your data

Teplus is self hosted. Your database is yours and nothing reports back to anyone. You are responsible for the privacy law that applies to your contacts.

## 18 / Done

That's it. Teplus is yours. The last page is only for people using a regular chat without agent mode.

# No agent mode? Paste and wait.

## 19 / Terminal basics

Terminal is the plain black window on your Mac where you paste commands.

- Open it: press **Cmd+Space**, type **Terminal**, press Enter.
- Paste one line at a time, press Enter, then wait for it to finish before typing more.
- A command still running must be stopped first: press **Control+C**.
- Stuck? Press **Cmd+Q** to quit Terminal, then reopen it and continue.

## 20 / The seven steps

Ask your chat AI to explain any line before you paste it. Run them in order.

**1. Download Teplus, then go to its folder.** Open github.com/teplus-OS/teplus, click the green **Code** button, then **Download ZIP**. Unzip it. In Terminal type `cd` and a space, drag that folder in from Finder, press Enter.

**2. Log in to Supabase.**

```
npx supabase login
```

**3. Link your project.** Copy this, then swap in your project ref:

```
npx supabase link --project-ref YOUR_PROJECT_REF
```

**4. Run the setup script.** The Project URL is under Project Settings → Data API, the publishable key under Project Settings → API keys. The project ref is the short code in your project's URL. Copy this, then swap in your three values:

```
PROJECT_REF=... SUPABASE_URL=... PUBLISHABLE_KEY=... bash setup.sh
```

**5. Run the schedule SQL.** If the script could not run the schedule SQL itself, it prints the name of a SQL file. Open it, copy everything, paste it into the Supabase SQL editor, and run it.

**6. Open your URL.** The script prints it at the end. If it sends you to a Vercel login instead of Teplus, go to the Vercel dashboard for this project → Settings → Deployment Protection, and switch off **Vercel Authentication**.

**7. Sign in.** Use the email and password you created for the auth user in Supabase.

**8. Loading people or companies.** Ask your AI to turn your file into SQL insert statements for Teplus (it can read `supabase/schema.sql` for the columns), then paste the result into the Supabase SQL editor and run it.

---

teplus.io · © 2026 RS Standard LLC · MIT licensed · Built by Ricky Agran
