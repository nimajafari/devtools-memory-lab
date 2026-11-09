# Caveats

The limits of this lab, so you know how far to trust the numbers.

* **Sizes vary.** Snapshot sizes depend on the Chrome version, the operating system and the machine. Compare relative growth, not absolute megabytes. Object counts are stable. Sizes are not.
* **Snapshots change what you measure.** Taking a heap snapshot forces a garbage collection and pauses the page while it runs.
* **DevTools can retain objects.** Logging an object in the Console, selecting an element in the Elements panel, or evaluating an expression can keep that object alive. Browser extensions can do the same. Use a clean Guest or Incognito window.
* **The lab exaggerates on purpose.** Each render builds 6000 products with descriptions of about 500 characters, so the leak is easy to see. Real leaks are often much smaller per step and take longer to notice.
* **The page counters are not measurements.** The stats panel shows numbers that the app counts for itself. They help you follow along, but only DevTools shows what is in memory.
* **The INP connection is indirect.** A growing heap can make garbage collection pauses longer, and that can slow interactions. This lab does not measure INP.
* **No search claims.** This lab does not show that heap size is a ranking factor, or that it changes how Googlebot indexes a page.
* **Desktop only.** The exercises were written for desktop Chrome. Edge works too, but some labels differ.
* **A bounded cache can look like a leak at first.** Bounded cache mode grows during warm-up, so a single before and after comparison shows growth. Repeat the flow several times and compare later snapshots with each other.
* **The lab's cache plateau is easy to reach.** The lab has only 5 categories, so even an unbounded cache stops growing quickly. On a real site the number of keys can be much larger, so check the limit in the code as well as the plateau.
* **Harness numbers come from an automated browser.** The optional harness drives Chrome for Testing in headless mode and reads the used JS heap size after a forced garbage collection. Your numbers in a normal Chrome window will differ.
