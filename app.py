#!/usr/bin/env python3
"""
Staff Portal — bon-soleil internal tools gateway
Uses staff_auth for shared authentication across all staff apps.
"""
import os
import sys
import subprocess
import signal

# Add staff-auth to path
sys.path.insert(0, os.path.expanduser('/Users/teddy/staff-auth'))

from flask import Flask, redirect, url_for, send_from_directory, request, Response, jsonify, session
from markupsafe import escape
import json
import glob
from staff_auth import init_auth, require_auth, get_current_user

app = Flask(__name__)
app.config['TEMPLATES_AUTO_RELOAD'] = True

# Initialize shared auth (standalone=True adds /login, /logout routes)
init_auth(app, standalone=True)

# --- Static file directories (protected) ---
PROTECTED_DIRS = {
    'discussions': os.path.expanduser('~/documents/discussions'),
    'charsheets': os.path.expanduser('~/www/charsheets'),
}
PRESETS_DIR = os.path.expanduser('~/openclaw/skills/nanobanana/presets')
CHARSHEETS_DIR = os.path.expanduser('~/www/charsheets')
# Characters excluded from management (story/work characters)
EXCLUDED_CHARS = {'dao_de_jing', 'lotus_sutra', 'pali_canon'}

@app.route('/')
@require_auth
def index():
    user = get_current_user()
    return f"""<!DOCTYPE html>
<html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Staff Portal — bon-soleil</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
<style>
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
         background: #1a1a2e; color: #e0e0e0; min-height: 100vh; }}
  .header {{ background: #16213e; border-bottom: 1px solid #0f3460; padding: 16px 24px;
             display: flex; justify-content: space-between; align-items: center; }}
  .header h1 {{ color: #e94560; font-size: 1.3em; }}
  .header .user {{ color: #888; font-size: 0.9em; }}
  .header a {{ color: #e94560; text-decoration: none; margin-left: 16px; }}
  .header a:hover {{ text-decoration: underline; }}
  .tools {{ max-width: 800px; margin: 40px auto; padding: 0 24px; }}
  .tools h2 {{ color: #aaa; font-size: 1em; margin-bottom: 16px; text-transform: uppercase; letter-spacing: 2px; }}
  .tool-grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; }}
  .tool {{ background: #16213e; border: 1px solid #0f3460; border-radius: 8px; padding: 20px;
           text-decoration: none; color: #e0e0e0; transition: border-color 0.2s; }}
  .tool:hover {{ border-color: #e94560; }}
  .tool i {{ font-size: 1.5em; color: #e94560; margin-bottom: 8px; display: block; }}
  .tool .name {{ font-weight: 600; margin-bottom: 4px; }}
  .tool .desc {{ color: #888; font-size: 0.85em; }}
</style>
</head><body>
<div class="header">
  <h1><i class="fa-solid fa-shield-halved"></i> Staff Portal</h1>
  <div class="user">
    {user['username']} ({user['role']})
    <a href="/logout"><i class="fa-solid fa-right-from-bracket"></i> Logout</a>
  </div>
</div>
<div class="tools">
  <h2>Internal Tools</h2>
  <div class="tool-grid">
    <a href="/ragmyadmin/" class="tool">
      <i class="fa-solid fa-database"></i>
      <div class="name">ragMyAdmin</div>
      <div class="desc">ChromaDB management</div>
    </a>
    <a href="/discussions/" class="tool">
      <i class="fa-solid fa-comments"></i>
      <div class="name">Discussions</div>
      <div class="desc">Meeting notes & discussions</div>
    </a>
    <a href="/services/" class="tool">
      <i class="fa-solid fa-server"></i>
      <div class="name">Services</div>
      <div class="desc">Server process management</div>
    </a>
    <a href="/crons/" class="tool">
      <i class="fa-solid fa-clock"></i>
      <div class="name">Cron Jobs</div>
      <div class="desc">Scheduled task management</div>
    </a>
    <a href="/characters/" class="tool">
      <i class="fa-solid fa-users"></i>
      <div class="name">Characters</div>
      <div class="desc">Character presets & generation config</div>
    </a>
    <a href="/charsheets/" class="tool">
      <i class="fa-solid fa-palette"></i>
      <div class="name">Character Sheets</div>
      <div class="desc">Character design references</div>
    </a>
  </div>
</div>
</body></html>"""

# --- Protected static file serving ---
@app.route('/discussions/')
@app.route('/discussions/<path:filepath>')
@require_auth
def serve_discussions(filepath=''):
    base = PROTECTED_DIRS['discussions']
    if not filepath or filepath.endswith('/'):
        full = os.path.join(base, filepath or '')
        index = os.path.join(full, 'index.html')
        if os.path.isfile(index):
            return send_from_directory(full, 'index.html')
        return _dir_listing(base, filepath, 'discussions')
    return send_from_directory(base, filepath)

@app.route('/charsheets/')
@app.route('/charsheets/<path:filepath>')
@require_auth
def serve_charsheets(filepath=''):
    base = PROTECTED_DIRS['charsheets']
    if not filepath or filepath.endswith('/'):
        # Serve index.html if it exists in the directory
        full = os.path.join(base, filepath or '')
        index = os.path.join(full, 'index.html')
        if os.path.isfile(index):
            return send_from_directory(full, 'index.html')
        return _dir_listing(base, filepath, 'charsheets')
    return send_from_directory(base, filepath)

IMAGE_EXTS = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'}
VIEWER_MAP = {
    '.md': ('md', 'fa-brands fa-markdown', '#8be9fd'),
    '.glb': ('3d', 'fa-solid fa-cube', '#50fa7b'),
    '.gltf': ('3d', 'fa-solid fa-cube', '#50fa7b'),
}

def _dir_listing(base, subpath, prefix):
    """Directory listing with image thumbnails and viewer links"""
    full = os.path.join(base, subpath)
    if not os.path.isdir(full):
        return "Not found", 404
    entries = sorted(os.listdir(full))
    
    folders = []
    images = []
    files = []
    for e in entries:
        if e.startswith('.') or e.endswith('.bak'):
            continue
        fp = os.path.join(full, e)
        href = f'/{prefix}/{subpath}{e}'
        ext = os.path.splitext(e)[1].lower()
        if os.path.isdir(fp):
            folders.append(f'<a href="{href}/" class="folder"><i class="fa-solid fa-folder"></i> {e}/</a>')
        elif ext in IMAGE_EXTS:
            images.append(f'''<a href="{href}" class="thumb" target="_blank">
              <img src="{href}" loading="lazy" alt="{e}">
              <span>{e}</span></a>''')
        elif ext in VIEWER_MAP:
            viewer, icon, color = VIEWER_MAP[ext]
            viewer_href = f'/viewer/{viewer}?file={href}'
            files.append(f'<a href="{viewer_href}" class="file" style="color:{color}"><i class="{icon}"></i> {e}</a>')
        else:
            files.append(f'<a href="{href}" class="file"><i class="fa-solid fa-file"></i> {e}</a>')
    
    folder_html = ''.join(folders)
    image_html = ''.join(images)
    file_html = ''.join(files)
    
    # Parent path
    parent = f'/{prefix}/{subpath}../'
    
    return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{prefix}/{subpath}</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
<style>
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{ font-family: -apple-system, sans-serif; background: #1a1a2e; color: #e0e0e0; padding: 24px; }}
  .nav {{ margin-bottom: 20px; display: flex; gap: 16px; }}
  .nav a {{ color: #e94560; text-decoration: none; }}
  .nav a:hover {{ text-decoration: underline; }}
  h1 {{ color: #e94560; font-size: 1.2em; margin-bottom: 20px; }}
  .folders {{ margin-bottom: 20px; }}
  .folder {{ color: #8be9fd; text-decoration: none; display: inline-block; padding: 6px 16px 6px 0; }}
  .folder:hover {{ text-decoration: underline; }}
  .folder i {{ margin-right: 6px; }}
  .grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; margin-bottom: 20px; }}
  .thumb {{ display: block; background: #16213e; border: 1px solid #0f3460; border-radius: 8px;
            overflow: hidden; text-decoration: none; transition: border-color 0.2s; }}
  .thumb:hover {{ border-color: #e94560; }}
  .thumb img {{ width: 100%; height: 200px; object-fit: cover; display: block; }}
  .thumb span {{ display: block; padding: 8px; color: #aaa; font-size: 0.8em; white-space: nowrap;
                 overflow: hidden; text-overflow: ellipsis; }}
  .file {{ color: #e94560; text-decoration: none; display: block; padding: 4px 0; }}
  .file:hover {{ text-decoration: underline; }}
  .file i {{ margin-right: 6px; }}
</style></head><body>
<div class="nav">
  <a href="/"><i class="fa-solid fa-arrow-left"></i> Staff Portal</a>
  <a href="{parent}"><i class="fa-solid fa-level-up-alt"></i> Up</a>
</div>
<h1><i class="fa-solid fa-folder-open"></i> {prefix}/{subpath}</h1>
<div class="folders">{folder_html}</div>
<div class="grid">{image_html}</div>
{file_html}
</body></html>"""


# --- Character Management ---
def _load_all_presets():
    presets = {}
    for fp in sorted(glob.glob(os.path.join(PRESETS_DIR, '*.json'))):
        name = os.path.splitext(os.path.basename(fp))[0]
        with open(fp) as f:
            presets[name] = json.load(f)
    return presets

def _get_charsheet_images(name):
    """Get available charsheet images for a character."""
    # Try common directory names and variations
    candidates = [name, name.lower()]
    # Also check preset's charsheet path for directory hint
    preset_path = os.path.join(PRESETS_DIR, f'{name}.json')
    if os.path.isfile(preset_path):
        with open(preset_path) as f:
            p = json.load(f)
        cs = p.get('charsheet', '')
        if cs:
            cs_dir = os.path.basename(os.path.dirname(os.path.expanduser(cs)))
            if cs_dir:
                candidates.insert(0, cs_dir)
    for dirname in candidates:
        d = os.path.join(CHARSHEETS_DIR, dirname)
        if os.path.isdir(d):
            return [f'/charsheets/{dirname}/{f}' for f in sorted(os.listdir(d))
                    if os.path.splitext(f)[1].lower() in IMAGE_EXTS]
    return []

@app.route('/characters/')
@require_auth
def characters_list():
    presets = _load_all_presets()
    # Also find charsheet dirs without presets (exclude story characters)
    charsheet_dirs = set()
    if os.path.isdir(CHARSHEETS_DIR):
        charsheet_dirs = {d for d in os.listdir(CHARSHEETS_DIR) if os.path.isdir(os.path.join(CHARSHEETS_DIR, d)) and d not in EXCLUDED_CHARS and not d.startswith('.')}

    cards = []
    for name, data in presets.items():
        images = _get_charsheet_images(name)
        thumb = images[0] if images else ''
        styles = ', '.join(data.get('styles', {}).keys())
        cards.append(f'''<a href="/characters/{name}" class="char-card">
          <div class="char-thumb">{'<img src="' + thumb + '">' if thumb else '<i class="fa-solid fa-user"></i>'}</div>
          <div class="char-info">
            <div class="char-name">{escape(name)}</div>
            <div class="char-styles">{escape(styles)}</div>
          </div></a>''')

    # Show charsheet dirs without presets
    for d in sorted(charsheet_dirs - set(presets.keys())):
        images = _get_charsheet_images(d)
        thumb = images[0] if images else ''
        cards.append(f'''<a href="/characters/{d}" class="char-card no-preset">
          <div class="char-thumb">{'<img src="' + thumb + '">' if thumb else '<i class="fa-solid fa-user"></i>'}</div>
          <div class="char-info">
            <div class="char-name">{escape(d)}</div>
            <div class="char-styles" style="color:#e94560">no preset</div>
          </div></a>''')

    return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Characters — Staff Portal</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
<style>
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{ font-family: -apple-system, sans-serif; background: #1a1a2e; color: #e0e0e0; padding: 24px; }}
  .nav {{ margin-bottom: 24px; }}
  .nav a {{ color: #e94560; text-decoration: none; margin-right: 16px; }}
  .nav a:hover {{ text-decoration: underline; }}
  h1 {{ color: #e94560; font-size: 1.3em; margin-bottom: 24px; }}
  .grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; }}
  .char-card {{ display: flex; gap: 12px; background: #16213e; border: 1px solid #0f3460; border-radius: 8px;
                padding: 12px; text-decoration: none; color: #e0e0e0; transition: border-color 0.2s; align-items: center; }}
  .char-card:hover {{ border-color: #e94560; }}
  .char-card.no-preset {{ opacity: 0.6; }}
  .char-thumb {{ width: 64px; height: 64px; border-radius: 8px; overflow: hidden; flex-shrink: 0;
                 background: #0f3460; display: flex; align-items: center; justify-content: center; }}
  .char-thumb img {{ width: 100%; height: 100%; object-fit: cover; }}
  .char-thumb i {{ font-size: 1.5em; color: #555; }}
  .char-name {{ font-weight: 600; font-size: 1.1em; }}
  .char-styles {{ color: #8be9fd; font-size: 0.85em; margin-top: 4px; }}
  .add-btn {{ display: inline-block; margin-top: 24px; padding: 10px 20px; background: #e94560; color: white;
              border-radius: 6px; text-decoration: none; font-weight: 600; }}
  .add-btn:hover {{ background: #c73652; }}
</style></head><body>
<div class="nav"><a href="/"><i class="fa-solid fa-arrow-left"></i> Staff Portal</a></div>
<h1><i class="fa-solid fa-users"></i> Characters</h1>
<div class="grid">{''.join(cards)}</div>
</body></html>"""


@app.route('/characters/<name>')
@require_auth
def character_detail(name):
    preset_path = os.path.join(PRESETS_DIR, f'{name}.json')
    preset = {}
    if os.path.isfile(preset_path):
        with open(preset_path) as f:
            preset = json.load(f)

    images = _get_charsheet_images(name)
    styles = preset.get('styles', {})
    charsheet_ref = preset.get('charsheet', '')

    # Build style cards
    style_cards = []
    for sname, sdata in styles.items():
        model = sdata.get('model', 'default')
        desc = sdata.get('description', '')
        prefix = sdata.get('prompt_prefix', '')
        shortcut = f'python3 ~/openclaw/skills/nanobanana/generate.py --preset {name} --style {sname} "YOUR PROMPT" -o ~/generates/output.jpg'
        style_cards.append(f'''<div class="style-card">
          <div class="style-header">
            <span class="style-name">{escape(sname)}</span>
            <span class="style-model">{escape(model)}</span>
          </div>
          <div class="style-desc">{escape(desc)}</div>
          <div class="style-prefix">{escape(prefix[:200])}</div>
          <div class="shortcut">
            <code>{escape(shortcut)}</code>
            <button onclick="navigator.clipboard.writeText(this.previousElementSibling.textContent)" title="Copy">
              <i class="fa-solid fa-copy"></i>
            </button>
          </div>
        </div>''')

    # Image gallery
    img_html = ''.join(f'''<div class="img-card">
      <a href="{img}" target="_blank"><img src="{img}" loading="lazy"></a>
      <button class="extract-btn" onclick="extractPrompt('{img}')" title="Extract prompt from this image">
        <i class="fa-solid fa-wand-magic-sparkles"></i>
      </button>
    </div>''' for img in images)

    return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{escape(name)} — Characters</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
<style>
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{ font-family: -apple-system, sans-serif; background: #1a1a2e; color: #e0e0e0; padding: 24px; }}
  .nav {{ margin-bottom: 24px; display: flex; gap: 16px; }}
  .nav a {{ color: #e94560; text-decoration: none; }}
  .nav a:hover {{ text-decoration: underline; }}
  h1 {{ color: #e94560; font-size: 1.3em; margin-bottom: 8px; }}
  .char-desc {{ color: #aaa; margin-bottom: 24px; line-height: 1.6; }}
  h2 {{ color: #8be9fd; font-size: 1em; margin: 24px 0 12px; text-transform: uppercase; letter-spacing: 1px; }}
  .gallery {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; margin-bottom: 24px; }}
  .img-card {{ position: relative; }}
  .img-card img {{ width: 100%; height: 180px; object-fit: cover; border-radius: 8px; border: 1px solid #0f3460; }}
  .img-card a:hover img {{ border-color: #e94560; }}
  .extract-btn {{ position: absolute; bottom: 8px; right: 8px; background: #e94560; color: white; border: none;
                  border-radius: 6px; padding: 6px 10px; cursor: pointer; font-size: 0.85em; opacity: 0.8; }}
  .extract-btn:hover {{ opacity: 1; }}
  .extract-result {{ margin: 12px 0; padding: 12px; background: #0d1117; border-radius: 6px; border: 1px solid #0f3460; }}
  .extract-result textarea {{ width: 100%; min-height: 80px; background: transparent; color: #8be9fd; border: none;
                              font-family: monospace; font-size: 0.9em; resize: vertical; }}
  .extract-result .actions {{ margin-top: 8px; display: flex; gap: 8px; }}
  .extract-result .actions button {{ padding: 6px 12px; border: none; border-radius: 4px; cursor: pointer; font-size: 0.85em; }}
  .btn-copy {{ background: #8be9fd; color: #1a1a2e; }}
  .btn-apply {{ background: #50fa7b; color: #1a1a2e; }}
  .style-card {{ background: #16213e; border: 1px solid #0f3460; border-radius: 8px; padding: 16px; margin-bottom: 12px; }}
  .style-header {{ display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }}
  .style-name {{ font-weight: 700; color: #50fa7b; font-size: 1.1em; }}
  .style-model {{ color: #bd93f9; font-size: 0.85em; background: #0f3460; padding: 2px 8px; border-radius: 4px; }}
  .style-desc {{ color: #ccc; margin-bottom: 6px; }}
  .style-prefix {{ color: #888; font-size: 0.85em; font-style: italic; margin-bottom: 10px; }}
  .shortcut {{ display: flex; align-items: center; gap: 8px; background: #0d1117; padding: 8px 12px; border-radius: 6px; overflow-x: auto; }}
  .shortcut code {{ color: #8be9fd; font-size: 0.8em; white-space: nowrap; }}
  .shortcut button {{ background: none; border: none; color: #888; cursor: pointer; padding: 4px; }}
  .shortcut button:hover {{ color: #e94560; }}
  .json-section {{ margin-top: 24px; }}
  .json-toggle {{ color: #e94560; cursor: pointer; font-size: 0.9em; }}
  .json-editor {{ display: none; margin-top: 8px; }}
  .json-editor textarea {{ width: 100%; min-height: 300px; background: #0d1117; color: #e0e0e0; border: 1px solid #0f3460;
                           border-radius: 6px; padding: 12px; font-family: monospace; font-size: 0.85em; resize: vertical; }}
  .save-btn {{ margin-top: 8px; padding: 8px 16px; background: #50fa7b; color: #1a1a2e; border: none; border-radius: 6px;
               font-weight: 600; cursor: pointer; }}
  .save-btn:hover {{ background: #3dd66b; }}
  .msg {{ margin-top: 8px; font-size: 0.9em; }}
</style></head><body>
<div class="nav">
  <a href="/characters/"><i class="fa-solid fa-arrow-left"></i> Characters</a>
  <a href="/charsheets/{escape(name)}/"><i class="fa-solid fa-palette"></i> Charsheets</a>
</div>
<h1><i class="fa-solid fa-user"></i> {escape(name)}</h1>
<div class="char-desc">{escape(preset.get('character', 'No preset defined'))}</div>

<h2><i class="fa-solid fa-images"></i> Reference Images</h2>
<div class="gallery">{img_html if img_html else '<em style="color:#888">No images in charsheets/' + name + '/</em>'}</div>
<div class="extract-result" id="extract-result" style="display:none">
  <strong><i class="fa-solid fa-wand-magic-sparkles"></i> Extracted Prompt:</strong>
  <textarea id="extracted-prompt" readonly></textarea>
  <div class="actions">
    <button class="btn-copy" onclick="navigator.clipboard.writeText(document.getElementById('extracted-prompt').value)">
      <i class="fa-solid fa-copy"></i> Copy
    </button>
    <button class="btn-apply" onclick="applyPrompt()">
      <i class="fa-solid fa-check"></i> Apply as prompt_features
    </button>
  </div>
</div>

<h2><i class="fa-solid fa-wand-magic-sparkles"></i> Styles & Shortcuts</h2>
{''.join(style_cards) if style_cards else '<em style="color:#888">No styles defined</em>'}

<div class="json-section">
  <span class="json-toggle" onclick="let e=document.getElementById('json-ed');e.style.display=e.style.display==='none'?'block':'none'">
    <i class="fa-solid fa-code"></i> Edit JSON
  </span>
  <div class="json-editor" id="json-ed">
    <textarea id="json-raw">{escape(json.dumps(preset, ensure_ascii=False, indent=2))}</textarea>
    <button class="save-btn" onclick="savePreset()"><i class="fa-solid fa-floppy-disk"></i> Save</button>
    <div class="msg" id="save-msg"></div>
  </div>
</div>

<script>
function extractPrompt(imagePath) {{
  const btn = event.target.closest('.extract-btn');
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
  fetch('/api/characters/{escape(name)}/extract-prompt', {{
    method: 'POST',
    headers: {{'Content-Type': 'application/json'}},
    body: JSON.stringify({{image: imagePath}})
  }})
    .then(r => r.json())
    .then(d => {{
      btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i>';
      if (d.ok) {{
        document.getElementById('extracted-prompt').value = d.prompt;
        document.getElementById('extract-result').style.display = 'block';
      }} else {{
        alert('Error: ' + d.error);
      }}
    }})
    .catch(e => {{ btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i>'; alert(e); }});
}}

function applyPrompt() {{
  const prompt = document.getElementById('extracted-prompt').value;
  // Open JSON editor and update prompt_features
  const editor = document.getElementById('json-ed');
  editor.style.display = 'block';
  try {{
    const raw = document.getElementById('json-raw').value;
    const data = JSON.parse(raw);
    data.prompt_features = prompt;
    document.getElementById('json-raw').value = JSON.stringify(data, null, 2);
    document.getElementById('save-msg').innerHTML = '<span style="color:#8be9fd">prompt_features updated — click Save to persist</span>';
  }} catch(e) {{ alert('JSON parse error: ' + e); }}
}}

function savePreset() {{
  const raw = document.getElementById('json-raw').value;
  try {{ JSON.parse(raw); }} catch(e) {{ document.getElementById('save-msg').innerHTML='<span style=\"color:#e94560\">Invalid JSON: '+e+'</span>'; return; }}
  fetch('/api/characters/{escape(name)}', {{method:'PUT', headers:{{'Content-Type':'application/json'}}, body:raw}})
    .then(r => r.json())
    .then(d => {{ document.getElementById('save-msg').innerHTML = d.ok ? '<span style=\"color:#50fa7b\">Saved!</span>' : '<span style=\"color:#e94560\">'+d.error+'</span>'; }})
    .catch(e => {{ document.getElementById('save-msg').innerHTML = '<span style=\"color:#e94560\">'+e+'</span>'; }});
}}
</script>
</body></html>"""


@app.route('/api/characters/<name>/extract-prompt', methods=['POST'])
@require_auth
def api_extract_prompt(name):
    """Extract prompt_features from a charsheet image using Gemini."""
    try:
        data = request.get_json()
        image_path = data.get('image', '')
        if not image_path:
            return jsonify({'ok': False, 'error': 'No image specified'}), 400
        
        # Resolve image path: /charsheets/xxx/yyy.jpg -> ~/www/charsheets/xxx/yyy.jpg
        if image_path.startswith('/charsheets/'):
            full_path = os.path.join(CHARSHEETS_DIR, image_path[len('/charsheets/'):])
        else:
            return jsonify({'ok': False, 'error': 'Invalid image path'}), 400
        
        if not os.path.isfile(full_path):
            return jsonify({'ok': False, 'error': f'File not found: {image_path}'}), 404
        
        from google import genai
        from google.genai import types
        
        api_key = open(os.path.expanduser('~/.config/google/gemini_api_key')).read().strip()
        client = genai.Client(api_key=api_key)
        
        with open(full_path, 'rb') as f:
            img_data = f.read()
        
        ext = os.path.splitext(full_path)[1].lower()
        mime = 'image/png' if ext == '.png' else 'image/jpeg'
        
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=[
                types.Part.from_bytes(data=img_data, mime_type=mime),
                'Describe ONLY this character\'s physical appearance for use as an image generation character definition. '
                'Include: hair style, hair color, clothing details, accessories, distinguishing features (horns, ears, etc). '
                'Exclude: background, art style, pose, expression, lighting, camera angle. '
                'Output a single concise English description. No preamble, no explanation, just the character description.'
            ]
        )
        
        return jsonify({'ok': True, 'prompt': response.text.strip()})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


@app.route('/api/characters/<name>', methods=['PUT'])
@require_auth
def api_save_preset(name):
    """Save character preset JSON."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'ok': False, 'error': 'Empty body'}), 400
        # Validate structure
        if 'character' not in data:
            return jsonify({'ok': False, 'error': 'Missing "character" field'}), 400
        preset_path = os.path.join(PRESETS_DIR, f'{name}.json')
        with open(preset_path, 'w') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


# --- Viewers ---
@app.route('/viewer/md')
@require_auth
def viewer_md():
    file_path = request.args.get('file', '')
    if not file_path:
        return "No file specified", 400
    return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{escape(file_path.split('/')[-1])}</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/5.5.0/github-markdown-dark.min.css">
<style>
  body {{ background: #1a1a2e; color: #e0e0e0; padding: 24px; font-family: -apple-system, sans-serif; }}
  .nav {{ margin-bottom: 20px; }}
  .nav a {{ color: #e94560; text-decoration: none; margin-right: 16px; }}
  .nav a:hover {{ text-decoration: underline; }}
  .markdown-body {{ max-width: 900px; margin: 0 auto; padding: 24px; background: #16213e; border-radius: 8px; }}
  .markdown-body img {{ max-width: 100%; }}
  .loading {{ color: #888; text-align: center; padding: 40px; }}
</style>
</head><body>
<div class="nav">
  <a href="javascript:history.back()"><i class="fa-solid fa-arrow-left"></i> Back</a>
  <a href="{escape(file_path)}" download><i class="fa-solid fa-download"></i> Raw</a>
</div>
<div class="markdown-body"><div class="loading">Loading...</div></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/marked/11.1.1/marked.min.js"></script>
<script>
fetch("{escape(file_path)}")
  .then(r => r.text())
  .then(md => {{
    document.querySelector('.markdown-body').innerHTML = marked.parse(md);
  }})
  .catch(e => {{
    document.querySelector('.markdown-body').innerHTML = '<p style="color:#e94560">Failed to load: ' + e + '</p>';
  }});
</script>
</body></html>"""


@app.route('/viewer/3d')
@require_auth
def viewer_3d():
    file_path = request.args.get('file', '')
    if not file_path:
        return "No file specified", 400
    fname = escape(file_path.split('/')[-1])
    return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{fname}</title>
<script type="module" src="https://ajax.googleapis.com/ajax/libs/model-viewer/3.5.0/model-viewer.min.js"></script>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
<style>
  body {{ background: #1a1a2e; color: #e0e0e0; padding: 24px; font-family: -apple-system, sans-serif; margin: 0; }}
  .nav {{ margin-bottom: 20px; padding: 0 24px; }}
  .nav a {{ color: #e94560; text-decoration: none; margin-right: 16px; }}
  .nav a:hover {{ text-decoration: underline; }}
  h1 {{ color: #e94560; font-size: 1.2em; margin: 0 24px 16px; }}
  model-viewer {{ width: 100%; height: calc(100vh - 120px); background: #0d1117; border-radius: 8px; }}
</style>
</head><body>
<div class="nav">
  <a href="javascript:history.back()"><i class="fa-solid fa-arrow-left"></i> Back</a>
  <a href="{escape(file_path)}" download><i class="fa-solid fa-download"></i> Download</a>
</div>
<h1><i class="fa-solid fa-cube"></i> {fname}</h1>
<model-viewer src="{escape(file_path)}" auto-rotate camera-controls shadow-intensity="1"
  environment-image="neutral" exposure="1" style="width:100%;height:calc(100vh - 120px)">
</model-viewer>
</body></html>"""


# --- Service Management ---
SERVICES = [
    {"name": "openclaw-gateway", "type": "systemd", "unit": "openclaw-gateway", "port": None, "desc": "OpenClaw Gateway"},
    {"name": "staff-portal", "type": "systemd", "unit": "staff-portal", "port": 8795, "desc": "Staff Portal (this app)"},
    {"name": "teddy-chatbot", "type": "systemd", "unit": "chat-api", "port": 8500, "desc": "Teddy Chatbot (RAG)"},
    {"name": "ragmyadmin", "type": "systemd", "unit": "ragmyadmin", "port": 8792, "desc": "ragMyAdmin"},
    {"name": "monolith", "type": "systemd", "unit": "monolith", "port": 8793, "desc": "Monolith English Visualizer"},
    {"name": "bizeny-chat", "type": "systemd", "unit": "bizeny-chat", "port": 8788, "desc": "Bizeny Akiko Chatbot"},
    {"name": "xpathgenie", "type": "systemd", "unit": "xpathgenie", "port": 8789, "desc": "XPathGenie"},
    {"name": "siegengin", "type": "process", "port": 8791, "cwd": "~/tools/siegeNgin/app", "cmd": "python3 -u server.py", "desc": "siegeNgin Proxy"},
    {"name": "medical-api", "type": "systemd", "unit": "mods-api", "port": 8000, "desc": "Medical Open Data API"},
]

def _get_service_status(svc):
    """Get status of a service."""
    info = {"name": svc["name"], "desc": svc["desc"], "type": svc["type"], "port": svc.get("port")}
    if svc["type"] == "systemd":
        try:
            # Try user-level first, then system-level
            for scope in (["systemctl", "--user"], ["systemctl"]):
                r = subprocess.run(scope + ["is-active", svc["unit"]], capture_output=True, text=True, timeout=5)
                if r.stdout.strip() == "active":
                    info["status"] = "active"
                    info["_scope"] = scope
                    break
            else:
                info["status"] = r.stdout.strip() or "inactive"
        except Exception:
            info["status"] = "unknown"
        # Get PID from systemctl
        try:
            scope = info.get("_scope", ["systemctl", "--user"])
            r = subprocess.run(scope + ["show", svc["unit"], "--property=MainPID"], capture_output=True, text=True, timeout=5)
            pid = r.stdout.strip().split("=")[-1]
            if pid and pid != "0":
                info["pid"] = int(pid)
                info["memory_mb"] = _get_pid_memory(int(pid))
        except Exception:
            pass
        info.pop("_scope", None)
    else:
        # Process type — find by port
        pid = _find_pid_by_port(svc["port"])
        if pid:
            info["status"] = "active"
            info["pid"] = pid
            info["memory_mb"] = _get_pid_memory(pid)
        else:
            info["status"] = "inactive"
    return info

def _find_pid_by_port(port):
    """Find PID listening on a port."""
    try:
        r = subprocess.run(["ss", "-tlnp", f"sport = :{port}"], capture_output=True, text=True, timeout=5)
        for line in r.stdout.split("\n"):
            if f":{port}" in line and "pid=" in line:
                pid_str = line.split("pid=")[1].split(",")[0].split(")")[0]
                return int(pid_str)
    except Exception:
        pass
    return None

def _get_pid_memory(pid):
    """Get RSS memory in MB for a PID (includes children)."""
    try:
        total = 0
        # Main process
        with open(f"/proc/{pid}/status") as f:
            for line in f:
                if line.startswith("VmRSS:"):
                    total += int(line.split()[1]) // 1024
                    break
        # Children
        r = subprocess.run(["pgrep", "-P", str(pid)], capture_output=True, text=True, timeout=5)
        for child_pid in r.stdout.strip().split("\n"):
            if child_pid:
                try:
                    with open(f"/proc/{child_pid}/status") as f:
                        for line in f:
                            if line.startswith("VmRSS:"):
                                total += int(line.split()[1]) // 1024
                                break
                except Exception:
                    pass
        return total
    except Exception:
        return None

def _service_action(svc, action):
    """Start/stop/restart a service. Returns (success, message)."""
    if action not in ("start", "stop", "restart"):
        return False, "Invalid action"

    if svc["type"] == "systemd":
        # Try user first, then system
        for scope in (["systemctl", "--user"], ["sudo", "systemctl"]):
            try:
                r = subprocess.run(scope + [action, svc["unit"]], capture_output=True, text=True, timeout=15)
                if r.returncode == 0:
                    return True, f"{action} OK"
            except Exception as e:
                continue
        return False, f"{action} failed"
    else:
        # Process type
        if action == "stop":
            pid = _find_pid_by_port(svc["port"])
            if pid:
                try:
                    os.kill(pid, signal.SIGTERM)
                    return True, f"Sent SIGTERM to {pid}"
                except Exception as e:
                    return False, str(e)
            return False, "Not running"
        elif action in ("start", "restart"):
            if action == "restart":
                pid = _find_pid_by_port(svc["port"])
                if pid:
                    try:
                        os.kill(pid, signal.SIGTERM)
                        import time; time.sleep(2)
                    except Exception:
                        pass
            cwd = os.path.expanduser(svc["cwd"])
            cmd = svc["cmd"]
            try:
                subprocess.Popen(
                    cmd, shell=True, cwd=cwd,
                    stdout=open(f"/tmp/{svc['name']}.log", "a"),
                    stderr=subprocess.STDOUT,
                    stdin=subprocess.DEVNULL,
                    start_new_session=True
                )
                return True, f"{action} initiated"
            except Exception as e:
                return False, str(e)
    return False, "Unknown error"

@app.route('/services/')
@require_auth
def services_page():
    user = get_current_user()
    is_admin = user.get('role') == 'admin'
    services = [_get_service_status(s) for s in SERVICES]
    # Get system memory
    try:
        r = subprocess.run(["free", "-m"], capture_output=True, text=True, timeout=5)
        mem_lines = r.stdout.strip().split("\n")
        mem_parts = mem_lines[1].split()
        mem_total = int(mem_parts[1])
        mem_used = int(mem_parts[2])
        mem_avail = int(mem_parts[-1])
    except Exception:
        mem_total = mem_used = mem_avail = 0

    # Get disk usage
    try:
        r = subprocess.run(["df", "-m", "/"], capture_output=True, text=True, timeout=5)
        disk_parts = r.stdout.strip().split("\n")[1].split()
        disk_total = int(disk_parts[1])
        disk_used = int(disk_parts[2])
        disk_avail = int(disk_parts[3])
    except Exception:
        disk_total = disk_used = disk_avail = 0

    rows = ""
    for s in services:
        status_class = "active" if s["status"] == "active" else "inactive"
        status_icon = "🟢" if s["status"] == "active" else "🔴"
        mem_str = f'{s["memory_mb"]} MB' if s.get("memory_mb") else "—"
        port_str = str(s["port"]) if s.get("port") else "—"
        pid_str = str(s.get("pid", "—"))
        buttons = ""
        if is_admin:
            if s["status"] == "active":
                buttons = f'''<button class="btn btn-stop" onclick="svcAction('{s["name"]}','stop')"><i class="fa-solid fa-stop"></i></button>
                             <button class="btn btn-restart" onclick="svcAction('{s["name"]}','restart')"><i class="fa-solid fa-rotate-right"></i></button>'''
            else:
                buttons = f'''<button class="btn btn-start" onclick="svcAction('{s["name"]}','start')"><i class="fa-solid fa-play"></i></button>'''
        action_col = f'<td>{buttons}</td>' if is_admin else ''
        rows += f'''<tr class="{status_class}">
            <td>{status_icon} {s["name"]}</td><td>{s["desc"]}</td><td>{port_str}</td>
            <td>{pid_str}</td><td>{mem_str}</td><td>{s["type"]}</td>{action_col}</tr>'''

    mem_pct = round(mem_used / mem_total * 100) if mem_total else 0
    disk_pct = round(disk_used / disk_total * 100) if disk_total else 0
    disk_total_gb = round(disk_total / 1024, 1)
    disk_used_gb = round(disk_used / 1024, 1)
    disk_avail_gb = round(disk_avail / 1024, 1)
    csrf_token = session.get('csrf_token', '')
    return f"""<!DOCTYPE html>
<html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Services — Staff Portal</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
<style>
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
         background: #1a1a2e; color: #e0e0e0; min-height: 100vh; }}
  .header {{ background: #16213e; border-bottom: 1px solid #0f3460; padding: 16px 24px;
             display: flex; justify-content: space-between; align-items: center; }}
  .header h1 {{ color: #e94560; font-size: 1.3em; }}
  .header a {{ color: #e94560; text-decoration: none; }}
  .container {{ max-width: 1000px; margin: 24px auto; padding: 0 24px; }}
  .mem-bar {{ background: #0f3460; border-radius: 8px; height: 24px; margin: 16px 0; position: relative; overflow: hidden; }}
  .mem-fill {{ background: {"#e94560" if mem_pct > 80 else "#4ecca3"}; height: 100%; border-radius: 8px; transition: width 0.3s; width: {mem_pct}%; }}
  .mem-label {{ position: absolute; top: 3px; left: 12px; font-size: 0.8em; font-weight: 600; }}
  table {{ width: 100%; border-collapse: collapse; margin-top: 16px; }}
  th {{ background: #16213e; color: #aaa; padding: 10px 8px; text-align: left; font-size: 0.85em;
       text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #0f3460; }}
  td {{ padding: 10px 8px; border-bottom: 1px solid #0f3460; font-size: 0.9em; }}
  tr.active td:first-child {{ color: #4ecca3; }}
  tr.inactive td:first-child {{ color: #e94560; }}
  .btn {{ border: none; border-radius: 4px; padding: 6px 10px; cursor: pointer; color: #fff; font-size: 0.8em; margin: 0 2px; }}
  .btn-stop {{ background: #e94560; }}
  .btn-stop:hover {{ background: #c73e54; }}
  .btn-start {{ background: #4ecca3; }}
  .btn-start:hover {{ background: #3db890; }}
  .btn-restart {{ background: #e9a045; }}
  .btn-restart:hover {{ background: #d08a30; }}
  #toast {{ display: none; position: fixed; bottom: 24px; right: 24px; background: #16213e;
           border: 1px solid #0f3460; border-radius: 8px; padding: 12px 20px; font-size: 0.9em; z-index: 999; }}
</style>
</head><body>
<div class="header">
  <h1><i class="fa-solid fa-server"></i> Services</h1>
  <a href="/"><i class="fa-solid fa-arrow-left"></i> Dashboard</a>
</div>
<div class="container">
  <div class="mem-bar"><div class="mem-fill"></div>
    <div class="mem-label"><i class="fa-solid fa-memory"></i> Memory: {mem_used} / {mem_total} MB ({mem_pct}%) — Available: {mem_avail} MB</div>
  </div>
  <div class="mem-bar"><div class="mem-fill" style="width:{disk_pct}%;background:{"#e94560" if disk_pct > 80 else "#4ecca3"}"></div>
    <div class="mem-label"><i class="fa-solid fa-hard-drive"></i> Disk: {disk_used_gb} / {disk_total_gb} GB ({disk_pct}%) — Available: {disk_avail_gb} GB</div>
  </div>
  <table>
    <tr><th>Service</th><th>Description</th><th>Port</th><th>PID</th><th>Memory</th><th>Type</th>{"<th>Actions</th>" if is_admin else ""}</tr>
    {rows}
  </table>
</div>
<div id="toast"></div>
<script>
async function svcAction(name, action) {{
  const btn = event.target.closest('button');
  btn.disabled = true;
  const toast = document.getElementById('toast');
  toast.style.display = 'block';
  toast.textContent = action + 'ing ' + name + '...';
  try {{
    const r = await fetch('/api/services/' + name + '/' + action, {{
      method: 'POST',
      headers: {{'X-CSRF-Token': '{csrf_token}'}}
    }});
    const d = await r.json();
    toast.textContent = d.ok ? '✅ ' + name + ': ' + d.message : '❌ ' + d.message;
    setTimeout(() => location.reload(), 1500);
  }} catch(e) {{
    toast.textContent = '❌ Error: ' + e.message;
  }}
  setTimeout(() => {{ toast.style.display = 'none'; }}, 3000);
}}
</script>
</body></html>"""

@app.route('/api/services/')
@require_auth
def api_services_list():
    return jsonify([_get_service_status(s) for s in SERVICES])

@app.route('/api/services/<name>/<action>', methods=['POST'])
@require_auth
def api_service_action(name, action):
    user = get_current_user()
    if user.get('role') != 'admin':
        return jsonify({"ok": False, "message": "Admin only"}), 403
    svc = next((s for s in SERVICES if s["name"] == name), None)
    if not svc:
        return jsonify({"ok": False, "message": "Service not found"}), 404
    # Don't allow stopping staff-portal itself (would kill this process)
    if name == "staff-portal" and action == "stop":
        return jsonify({"ok": False, "message": "Cannot stop self"}), 400
    ok, msg = _service_action(svc, action)
    return jsonify({"ok": ok, "message": msg})


# --- Cron Jobs ---
CRON_JOBS_FILE = os.path.expanduser('~/.openclaw/cron/jobs.json')

def _load_cron_jobs():
    """Load cron jobs from OpenClaw's jobs.json."""
    try:
        with open(CRON_JOBS_FILE) as f:
            data = json.load(f)
        return data.get('jobs', [])
    except Exception:
        return []

@app.route('/crons/')
@require_auth
def crons_page():
    user = get_current_user()
    is_admin = user.get('role') == 'admin'
    jobs = _load_cron_jobs()
    from datetime import datetime, timezone

    rows = ""
    for j in sorted(jobs, key=lambda x: x.get('name', '')):
        enabled = j.get('enabled', False)
        status_icon = "🟢" if enabled else "🔴"
        name = j.get('name', j.get('id', '?'))
        schedule = j.get('schedule', {})
        sched_kind = schedule.get('kind', '?')
        if sched_kind == 'cron':
            sched_str = f"<code>{schedule.get('expr', '?')}</code>"
            tz = schedule.get('tz', 'UTC')
            if tz != 'UTC':
                sched_str += f" <small>({tz})</small>"
        elif sched_kind == 'at':
            sched_str = f"at {schedule.get('at', '?')[:16]}"
        elif sched_kind == 'every':
            ms = schedule.get('everyMs', 0)
            sched_str = f"every {ms // 60000}m"
        else:
            sched_str = sched_kind

        state = j.get('state', {})
        next_run = state.get('nextRunAtMs')
        last_run = state.get('lastRunAtMs')
        last_status = state.get('lastStatus', '—')
        last_dur = state.get('lastDurationMs')

        if next_run:
            dt = datetime.fromtimestamp(next_run / 1000, tz=timezone.utc)
            next_str = dt.strftime('%m/%d %H:%M') + ' UTC'
        else:
            next_str = '—'

        if last_run:
            dt = datetime.fromtimestamp(last_run / 1000, tz=timezone.utc)
            last_str = dt.strftime('%m/%d %H:%M') + ' UTC'
        else:
            last_str = '—'

        dur_str = f"{last_dur // 1000}s" if last_dur else '—'
        status_cls = 'ok' if last_status == 'ok' else 'err' if last_status not in ('ok', '—') else ''

        target = j.get('sessionTarget', '?')
        payload_kind = j.get('payload', {}).get('kind', '?')
        delete_after = '🗑️' if j.get('deleteAfterRun') else ''

        job_id = j.get('id', '')
        toggle_label = 'Disable' if enabled else 'Enable'
        toggle_icon = 'fa-pause' if enabled else 'fa-play'
        toggle_cls = 'btn-stop' if enabled else 'btn-start'
        enabled_js = 'false' if enabled else 'true'
        action_td = f'<td><button class="btn {toggle_cls}" onclick="cronToggle(\'{job_id}\',{enabled_js})" title="{toggle_label}"><i class="fa-solid {toggle_icon}"></i></button></td>' if is_admin else ''
        rows += f"""<tr class="{'enabled' if enabled else 'disabled'}">
            <td>{status_icon} {name} {delete_after}</td>
            <td>{sched_str}</td>
            <td>{next_str}</td>
            <td>{last_str}</td>
            <td class="{status_cls}">{last_status}</td>
            <td>{dur_str}</td>
            <td>{target}</td>
            {action_td}
        </tr>"""

    enabled_count = sum(1 for j in jobs if j.get('enabled'))
    disabled_count = len(jobs) - enabled_count
    csrf_token = session.get('csrf_token', '')

    return f"""<!DOCTYPE html>
<html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cron Jobs — Staff Portal</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
<style>
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
         background: #1a1a2e; color: #e0e0e0; min-height: 100vh; }}
  .header {{ background: #16213e; border-bottom: 1px solid #0f3460; padding: 16px 24px;
             display: flex; justify-content: space-between; align-items: center; }}
  .header h1 {{ color: #e94560; font-size: 1.3em; }}
  .header a {{ color: #e94560; text-decoration: none; }}
  .container {{ max-width: 1100px; margin: 24px auto; padding: 0 24px; }}
  .summary {{ display: flex; gap: 16px; margin-bottom: 20px; }}
  .stat {{ background: #16213e; border: 1px solid #0f3460; border-radius: 8px; padding: 16px 20px; flex: 1; text-align: center; }}
  .stat .num {{ font-size: 2em; font-weight: 700; }}
  .stat .label {{ color: #888; font-size: 0.85em; margin-top: 4px; }}
  .stat.active .num {{ color: #4ecca3; }}
  .stat.inactive .num {{ color: #e94560; }}
  .stat.total .num {{ color: #e9a045; }}
  table {{ width: 100%; border-collapse: collapse; margin-top: 16px; }}
  th {{ background: #16213e; color: #aaa; padding: 10px 8px; text-align: left; font-size: 0.8em;
       text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #0f3460; }}
  td {{ padding: 10px 8px; border-bottom: 1px solid #0f3460; font-size: 0.85em; }}
  tr.disabled {{ opacity: 0.5; }}
  td.ok {{ color: #4ecca3; }}
  td.err {{ color: #e94560; }}
  code {{ background: #0f3460; padding: 2px 6px; border-radius: 4px; font-size: 0.85em; }}
  small {{ color: #666; }}
</style>
</head><body>
<div class="header">
  <h1><i class="fa-solid fa-clock"></i> Cron Jobs</h1>
  <a href="/"><i class="fa-solid fa-arrow-left"></i> Dashboard</a>
</div>
<div class="container">
  <div class="summary">
    <div class="stat total"><div class="num">{len(jobs)}</div><div class="label">Total Jobs</div></div>
    <div class="stat active"><div class="num">{enabled_count}</div><div class="label">Enabled</div></div>
    <div class="stat inactive"><div class="num">{disabled_count}</div><div class="label">Disabled</div></div>
  </div>
  <table>
    <tr><th>Job</th><th>Schedule</th><th>Next Run</th><th>Last Run</th><th>Status</th><th>Duration</th><th>Target</th>{"<th>Actions</th>" if is_admin else ""}</tr>
    {rows}
  </table>
</div>
<div id="toast" style="display:none;position:fixed;bottom:24px;right:24px;background:#16213e;border:1px solid #0f3460;border-radius:8px;padding:12px 20px;font-size:0.9em;z-index:999"></div>
<script>
async function cronToggle(jobId, enable) {{
  const toast = document.getElementById('toast');
  toast.style.display = 'block';
  toast.textContent = (enable ? 'Enabling' : 'Disabling') + '...';
  try {{
    const r = await fetch('/api/crons/' + jobId + '/toggle', {{
      method: 'POST',
      headers: {{'Content-Type': 'application/json', 'X-CSRF-Token': '{csrf_token}'}},
      body: JSON.stringify({{enabled: enable}})
    }});
    const d = await r.json();
    toast.textContent = d.ok ? '✅ ' + d.message : '❌ ' + d.message;
    setTimeout(() => location.reload(), 1000);
  }} catch(e) {{
    toast.textContent = '❌ ' + e.message;
  }}
  setTimeout(() => {{ toast.style.display = 'none'; }}, 3000);
}}
</script>
</body></html>"""


@app.route('/api/crons/<job_id>/toggle', methods=['POST'])
@require_auth
def api_cron_toggle(job_id):
    user = get_current_user()
    if user.get('role') != 'admin':
        return jsonify({"ok": False, "message": "Admin only"}), 403
    try:
        data = request.get_json()
        enabled = data.get('enabled', True)
        with open(CRON_JOBS_FILE) as f:
            cron_data = json.load(f)
        jobs = cron_data.get('jobs', [])
        found = False
        for j in jobs:
            if j.get('id') == job_id:
                j['enabled'] = enabled
                found = True
                break
        if not found:
            return jsonify({"ok": False, "message": "Job not found"}), 404
        with open(CRON_JOBS_FILE, 'w') as f:
            json.dump(cron_data, f, indent=2, ensure_ascii=False)
        return jsonify({"ok": True, "message": f"{'Enabled' if enabled else 'Disabled'}: {j.get('name', job_id)}"})
    except Exception as e:
        return jsonify({"ok": False, "message": str(e)}), 500


class PrefixMiddleware:
    def __init__(self, app, prefix=""):
        self.app = app
        self.prefix = prefix.rstrip("/")
    def __call__(self, environ, start_response):
        if self.prefix:
            environ["SCRIPT_NAME"] = self.prefix
            path = environ.get("PATH_INFO", "")
            if path.startswith(self.prefix):
                environ["PATH_INFO"] = path[len(self.prefix):] or "/"
        return self.app(environ, start_response)

if __name__ == '__main__':
    prefix = os.environ.get("APP_ROOT", "")
    if prefix:
        app.wsgi_app = PrefixMiddleware(app.wsgi_app, prefix=prefix)
    app.run(host='0.0.0.0', port=8795, debug=False)
