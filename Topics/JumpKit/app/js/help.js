// ── Help Page ──────────────────────────────────────────────────────
function renderHelp() {
  document.getElementById('pageContent').innerHTML = `

    <div class="help-grid">

      <div class="help-card">
        <h3><svg class="ti ti-layout-grid"><use href="img/tabler-sprite.svg#tabler-layout-grid"/></svg> Features</h3>
        <ul>
          <li>Instant jump launcher for URLs, folders, and file paths</li>
          <li>Up to 10 custom columns for organized categories</li>
          <li>Right-click context menus for fast actions</li>
          <li>Global hotkey support</li>
          <li>Favorite jump highlighting</li>
          <li>Click counting, time-saved & ROI tracking</li>
          <li>Personal ROI dashboard with charts &amp; stats</li>
          <li>Export ROI report as PDF</li>
          <li>Archive &amp; restore jumps</li>
          <li>Team jump sharing (up to 2 teams on Free, unlimited on Unlimited)</li>
          <li>Up to 5 members per team (Free) or unlimited members (Unlimited)</li>
          <li>Auto-archive unused jumps — Unlimited tier</li>
          <li>Auto-backup to local JSON file — Unlimited tier</li>
          <li>${window.electronAPI?.platform === 'win32'
            ? 'Zoom in with <kbd>Ctrl</kbd><kbd>+</kbd> and zoom out with <kbd>Ctrl</kbd><kbd>-</kbd>'
            : 'Zoom in with <kbd>⌘</kbd><kbd>+</kbd> and zoom out with <kbd>⌘</kbd><kbd>-</kbd>'}</li>
          <li>100% local storage — your data never leaves your machine</li>
          <li>Light &amp; dark mode</li>
          <li>Windows and macOS support</li>
        </ul>
      </div>

      <div class="help-card">
        <h3><svg class="ti ti-list-check"><use href="img/tabler-sprite.svg#tabler-list-check"/></svg> How-To Tips</h3>
        <ol>
          <li><strong>Left-click</strong> any jump to instantly open it — <svg class="ti ti-link"><use href="img/tabler-sprite.svg#tabler-link"/></svg> web URLs open in your browser, <svg class="ti ti-folder"><use href="img/tabler-sprite.svg#tabler-folder"/></svg> local paths open in your file manager.</li>
          <li>Go to <strong>Jumps</strong> and click the <strong>Add Jump</strong> button to create a new jump.</li>
          <li>Paste in a web URL (<code>https://...</code>) or a local/network path (<code>\\\\server\\share</code>).</li>
          <li>Right-click a jump to copy URL, edit, archive, or delete it.</li>
          <li>Archived jumps move to the <strong>Archive</strong> tab and can be restored anytime.</li>
          <li>Use <strong>Configure Columns</strong> to organize jumps into up to 10 categories.</li>
          <li>Assign <strong>hotkeys</strong> to jumps for keyboard-speed access.</li>
          <li>Mark jumps as <strong>favorites</strong> to highlight the ones you use most.</li>
        </ol>
      </div>

      <div class="help-card">
        <h3><svg class="ti ti-message-circle"><use href="img/tabler-sprite.svg#tabler-message-circle"/></svg> FAQs</h3>
        <div class="faq-item">
          <div class="faq-q">Where is my data stored?</div>
          <div class="faq-a">All data is stored locally on your machine in a local database. Nothing is sent to external servers unless you enable optional cloud backup.</div>
        </div>
        <div class="faq-item">
          <div class="faq-q">Can I share jumps with my team?</div>
          <div class="faq-a">Yes — groups with shared jumps are supported. Admins can define default jumps for all group members.</div>
        </div>
        <div class="faq-item">
          <div class="faq-q">Can I open local folders and network shares?</div>
          <div class="faq-a">Yes — any path that doesn't start with http://, https://, or www. is treated as a local or network path and opened via the native OS file manager.</div>
        </div>
        <div class="faq-item">
          <div class="faq-q">What happens when I archive a jump?</div>
          <div class="faq-a">Archived jumps are removed from all jump page views and shifted into the Archive view. You can restore or permanently delete them there.</div>
        </div>
        <div class="faq-item">
          <div class="faq-q">How are time savings calculated?</div>
          <div class="faq-a">JumpKit multiplies your total click count by the time-per-click value you configure on the <strong>Settings</strong> page. Adjust that value to match your real-world estimate.</div>
        </div>
        <div class="faq-item">
          <div class="faq-q">How do I specify which browser is opened when I click a jump link?</div>
          <div class="faq-a">To specify which browser opens after clicking a jump link, set your default browser in your macOS or Windows system settings. JumpKit will always launch whichever browser you have set as the system default.</div>
        </div>
      </div>

      <div class="help-card">
        <h3><svg class="ti ti-headset"><use href="img/tabler-sprite.svg#tabler-headset"/></svg> Support & About</h3>
        <div class="faq-item">
          <div class="faq-q">Support</div>
          <div class="faq-a">Email: <a href="mailto:support@jumpkit.app" style="color:var(--turq)">support@jumpkit.app</a><br/>Response time: within 1 business day.</div>
        </div>
        <div class="faq-item">
          <div class="faq-q">Website</div>
          <div class="faq-a"><a href="https://jumpkit.app" target="_blank" style="color:var(--turq)">jumpkit.app</a></div>
        </div>
        <div class="faq-item">
          <div class="faq-q">About JumpKit</div>
          <div class="faq-a">JumpKit was built by a power user who was tired of clicking through endless folders and browser bookmarks. Version 5 — built to be shared with the world.</div>
        </div>
        <div class="faq-item">
          <div class="faq-q">Version</div>
          <div class="faq-a">JumpKit v1.0.0 — Last updated June 7, 2026</div>
        </div>
      </div>

    </div>`;
}
