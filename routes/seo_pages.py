"""Static assets, SEO metadata (robots.txt, sitemap.xml, manifest.json), and legal pages."""

import json
import os
import secrets
import time
from flask import Blueprint, Response, current_app, jsonify, render_template, request, send_from_directory

from core.constants import SITE_URL
from core.security import SECURITY, get_client_ip, sanitize_text

seo_bp = Blueprint("seo_pages", __name__)


@seo_bp.route("/")
def index():
    return send_from_directory(current_app.static_folder, "index.html")


@seo_bp.route("/ads.txt")
def ads_txt():
    return send_from_directory(current_app.static_folder, "ads.txt", mimetype="text/plain")


@seo_bp.route("/favicon.ico")
def favicon():
    return send_from_directory(current_app.static_folder, "favicon.ico", mimetype="image/x-icon")


@seo_bp.route("/apple-touch-icon.png")
@seo_bp.route("/apple-touch-icon-precomposed.png")
def apple_touch_icon():
    return send_from_directory(current_app.static_folder, "apple-touch-icon.png", mimetype="image/png")


@seo_bp.route("/icon-48.png")
def icon_48():
    return send_from_directory(current_app.static_folder, "icon-48.png", mimetype="image/png")


@seo_bp.route("/icon-192.png")
def icon_192():
    return send_from_directory(current_app.static_folder, "icon-192.png", mimetype="image/png")


@seo_bp.route("/icon-512.png")
def icon_512():
    return send_from_directory(current_app.static_folder, "icon-512.png", mimetype="image/png")


@seo_bp.route("/icon.svg")
def icon_svg():
    return send_from_directory(current_app.static_folder, "icon.svg", mimetype="image/svg+xml")


@seo_bp.route("/manifest.json")
def manifest_json():
    manifest = {
        "name": "Dojo Shōgi Online (将棋)",
        "short_name": "Dojo Shōgi",
        "description": "Juega Shōgi (Ajedrez Tradicional Japonés) online gratis en tiempo real para 2 jugadores con Lobby de Matchmaking y Academia interactiva.",
        "start_url": "/",
        "display": "standalone",
        "background_color": "#0a101d",
        "theme_color": "#0a101d",
        "icons": [
            {"src": "/static/icon-48.png", "sizes": "48x48", "type": "image/png"},
            {"src": "/static/icon-192.png", "sizes": "192x192", "type": "image/png"},
            {"src": "/static/icon-512.png", "sizes": "512x512", "type": "image/png"},
            {"src": "/static/icon.svg", "sizes": "any", "type": "image/svg+xml"},
        ],
    }
    return jsonify(manifest)


@seo_bp.route("/robots.txt")
def robots_txt():
    lines = [
        "User-agent: *",
        "Allow: /",
        "Disallow: /api/",
        f"Sitemap: {SITE_URL}/sitemap.xml",
    ]
    return Response("\n".join(lines) + "\n", mimetype="text/plain")


@seo_bp.route("/sitemap.xml")
def sitemap_xml():
    today = time.strftime("%Y-%m-%d")
    pages = [
        ("/", "daily", "1.0"),
        ("/sobre-nosotros", "monthly", "0.8"),
        ("/about", "monthly", "0.8"),
        ("/politica-de-privacidad", "monthly", "0.7"),
        ("/privacy", "monthly", "0.7"),
        ("/terminos-de-servicio", "monthly", "0.7"),
        ("/terms", "monthly", "0.7"),
    ]
    urls_xml = "".join(
        f"""  <url>
    <loc>{SITE_URL}{path}</loc>
    <lastmod>{today}</lastmod>
    <changefreq>{freq}</changefreq>
    <priority>{prio}</priority>
  </url>\n"""
        for path, freq, prio in pages
    )
    xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
{urls_xml}</urlset>"""
    return Response(xml, mimetype="application/xml")


def render_legal_page(
    title: str,
    description: str,
    body_html: str,
    canonical_path: str = "/",
    lang: str = "es",
    other_lang_url: str = "/",
) -> str:
    year = time.strftime("%Y")
    canonical_url = f"{SITE_URL}{canonical_path}"
    is_en = lang == "en"

    html_lang = "en" if is_en else "es"
    og_locale = "en_US" if is_en else "es_AR"
    subtitle = (
        "Online Dojo · Real-Time Matchmaking & Game Rooms"
        if is_en
        else "Dojo Online · Matchmaking y Salas en Tiempo Real"
    )
    back_label = "← Back to Dojo / Board" if is_en else "← Volver al Dojo / Tablero"
    home_url = "/?lang=en" if is_en else "/"
    toggle_label = "ES" if is_en else "EN"

    footer_desc = (
        "Free and independent community platform to play Shōgi (Traditional Japanese Chess) online in real-time for 2 players or vs AI, with official rule motor in Python, Matchmaking Lobby, and interactive 12-lesson Dojo Academy in Spanish and English."
        if is_en
        else "Plataforma web comunitaria e independiente para jugar al Shōgi (Ajedrez Tradicional Japonés) online en tiempo real para 2 jugadores, con motor de reglas oficiales en Python, Lobby de Matchmaking y Academia interactiva paso a paso en español."
    )
    link_lobby = ("Lobby & Play" if is_en else "Lobby & Jugar", home_url)
    link_about = (
        "About Us & Contact" if is_en else "Sobre Nosotros & Contacto",
        "/about" if is_en else "/sobre-nosotros",
    )
    link_privacy = (
        "Privacy Policy" if is_en else "Política de Privacidad",
        "/privacy" if is_en else "/politica-de-privacidad",
    )
    link_terms = (
        "Terms of Service" if is_en else "Términos de Servicio",
        "/terms" if is_en else "/terminos-de-servicio",
    )

    footer_copy = (
        f"© {year} Shōgi Dojo Online. Created and maintained by <strong>Javier Valdivieso</strong> (Mendoza, Argentina)."
        if is_en
        else f"© {year} Shōgi Dojo Online. Creado y mantenido por <strong>Javier Valdivieso</strong> (Mendoza, Argentina)."
    )
    footer_source = (
        'Open source under MIT License · <a href="https://github.com/valdivieso01/shogi-web" target="_blank" rel="noopener noreferrer">GitHub: valdivieso01/shogi-web</a>'
        if is_en
        else 'Código abierto bajo Licencia MIT · <a href="https://github.com/valdivieso01/shogi-web" target="_blank" rel="noopener noreferrer">GitHub: valdivieso01/shogi-web</a>'
    )

    return render_template(
        "legal_layout.html",
        html_lang=html_lang,
        title=title,
        description=description,
        canonical_url=canonical_url,
        og_locale=og_locale,
        site_url=SITE_URL,
        subtitle=subtitle,
        other_lang_url=other_lang_url,
        toggle_label=toggle_label,
        home_url=home_url,
        back_label=back_label,
        body_html=body_html,
        footer_desc=footer_desc,
        link_lobby=link_lobby,
        link_about=link_about,
        link_privacy=link_privacy,
        link_terms=link_terms,
        footer_copy=footer_copy,
        footer_source=footer_source,
    )


@seo_bp.route("/sobre-nosotros")
@seo_bp.route("/about")
def page_sobre_nosotros():
    is_en = request.path == "/about" or request.args.get("lang") == "en"
    if is_en:
        body = """
      <h1>About Us &amp; Contact</h1>
      <p class="legal-updated">Independent Community Japanese Chess Platform</p>
      <section class="legal-section">
        <h2>What is Shōgi Dojo Online?</h2>
        <p><strong>Shōgi Dojo Online (将棋)</strong> was founded with the mission to bring the ancient Japanese strategy game —<em>Shōgi</em>— to an international community through a free, lightning-fast web platform with no mandatory registrations and clear interactive guides.</p>
        <ul>
          <li><strong>Official Python Rules Motor (OOP)</strong>: Complete piece validation, promotion in enemy ranks (<em>Nari</em>), drop reincorporation from the <em>Komadai</em> (<em>Drops</em>), algorithmic check detection (<em>Ōte</em>), checkmate (<em>Tsumi</em>), and traditional prohibitions like <em>Nifu</em> and <em>Uchifuzume</em>.</li>
          <li><strong>Real-Time Matchmaking Lobby</strong>: Automated quick pairing between online players, open public rooms, private code/link invite rooms, and live spectator mode powered by Server-Sent Events (SSE).</li>
          <li><strong>Interactive 12-Lesson Dojo Academy</strong>: A practical step-by-step course with visual compass diagrams (3×3 and 5×5) enabling anyone to master every piece.</li>
        </ul>
      </section>
      <section class="legal-section legal-highlight-box">
        <h2>Creator &amp; Mission</h2>
        <p>Designed, developed, and maintained independently by <strong>Javier Valdivieso</strong>, software developer based in Mendoza, Argentina.</p>
        <div class="legal-badges">
          <span>Engine Repository: <a href="https://github.com/valdivieso01/shogi" target="_blank" rel="noopener noreferrer">valdivieso01/shogi</a></span>
          <span>Web Platform: <a href="https://github.com/valdivieso01/shogi-web" target="_blank" rel="noopener noreferrer">valdivieso01/shogi-web</a></span>
          <span>Location: Mendoza, Argentina</span>
        </div>
      </section>
      <section class="legal-section">
        <h2>Contact &amp; Feedback</h2>
        <p>Reach out directly via email to: <a href="mailto:hjavier.valdivieso@outlook.es" class="legal-mail-link">hjavier.valdivieso@outlook.es</a></p>
      </section>"""
        return render_legal_page(
            "About Us & Contact",
            "Learn about Dojo Shōgi Online (dojoshogi.online), an open-source Japanese chess project with matchmaking and a 12-lesson academy, and how to contact creator Javier Valdivieso.",
            body,
            canonical_path="/about",
            lang="en",
            other_lang_url="/sobre-nosotros",
        )

    body = """
      <h1>Sobre Nosotros &amp; Contacto</h1>
      <p class="legal-updated">Proyecto Independiente de Ajedrez Japonés en Español e Inglés</p>
      <section class="legal-section">
        <h2>¿Qué es Shōgi Dojo Online?</h2>
        <p><strong>Shōgi Dojo Online (将棋)</strong> nació con la misión de acercar el milenario juego de estrategia japonés —el <em>Shōgi</em>— a la comunidad hispanohablante mediante una plataforma web gratuita, rápida, sin registros obligatorios y con explicaciones claras en español e inglés.</p>
        <ul>
          <li><strong>Motor oficial de reglas en Python (POO)</strong>: Valida movimientos de cada pieza, coronaciones en zona enemiga (<em>Nari</em>), reincorporación de piezas capturadas desde el <em>Komadai</em> (<em>Drops</em>), detección algorítmica de jaque (<em>Ōte</em>), jaque mate (<em>Tsumi</em>) y prohibiciones tradicionales como <em>Nifu</em> y <em>Uchifuzume</em>.</li>
          <li><strong>Lobby de Matchmaking en Tiempo Real</strong>: Emparejamiento automático entre jugadores online, salas públicas abiertas, salas privadas mediante código o enlace directo y modo espectador en vivo mediante Server-Sent Events (SSE).</li>
          <li><strong>Academia Interactiva de 12 Lecciones</strong>: Un curso práctico guiado con brújulas visuales de movimiento (3×3 y 5×5).</li>
        </ul>
      </section>
      <section class="legal-section legal-highlight-box">
        <h2>El Creador y Misión</h2>
        <p>El proyecto fue creado y es mantenido de forma independiente por <strong>Javier Valdivieso</strong>, desarrollador de software en Mendoza, Argentina.</p>
        <div class="legal-badges">
          <span>GitHub Motor: <a href="https://github.com/valdivieso01/shogi" target="_blank" rel="noopener noreferrer">valdivieso01/shogi</a></span>
          <span>GitHub Web: <a href="https://github.com/valdivieso01/shogi-web" target="_blank" rel="noopener noreferrer">valdivieso01/shogi-web</a></span>
          <span>Ubicación: Mendoza, Argentina</span>
        </div>
      </section>
      <section class="legal-section">
        <h2>Contacto y Sugerencias</h2>
        <p>Puedes comunicarte directamente por correo electrónico a: <a href="mailto:hjavier.valdivieso@outlook.es" class="legal-mail-link">hjavier.valdivieso@outlook.es</a></p>
      </section>"""
    return render_legal_page(
        "Sobre Nosotros y Contacto",
        "Conoce qué es Dojo Shōgi Online (dojoshogi.online), la historia del proyecto de ajedrez japonés en español y cómo contactar con su creador Javier Valdivieso.",
        body,
        canonical_path="/sobre-nosotros",
        lang="es",
        other_lang_url="/about",
    )


@seo_bp.route("/politica-de-privacidad")
@seo_bp.route("/privacy")
def page_privacidad():
    is_en = request.path == "/privacy" or request.args.get("lang") == "en"
    if is_en:
        body = """
      <h1>Privacy Policy</h1>
      <p class="legal-updated">Last updated: November 2026</p>
      <section class="legal-section">
        <h2>1. General Information</h2>
        <p>At <strong>Dojo Shōgi Online (将棋)</strong> (<a href="https://www.dojoshogi.online">https://www.dojoshogi.online</a>), visitor and player privacy is paramount. This document details the types of information processed when using our platform and our compliance with <strong>Google AdSense</strong> standards.</p>
      </section>
      <section class="legal-section">
        <h2>2. Game Data &amp; Local Storage</h2>
        <p>To enable instant multiplayer gaming without mandatory accounts, Shōgi Dojo Online stores in your browser (<code>localStorage</code> and <code>sessionStorage</code>) your chosen player nickname and a temporary cryptographic session token to reconnect you to active rooms.</p>
      </section>
      <section class="legal-section">
        <h2>3. Cookies &amp; Google AdSense Advertising</h2>
        <p>This website uses <strong>Google AdSense</strong> (publisher ID <code>ca-pub-4665232577336299</code>). Users may opt out of personalized advertising by visiting <a href="https://adssettings.google.com/" target="_blank" rel="noopener noreferrer">Google Ads Settings</a>.</p>
      </section>
      <section class="legal-section">
        <h2>4. Contact</h2>
        <p>For any questions concerning this Privacy Policy, email us at <a href="mailto:hjavier.valdivieso@outlook.es">hjavier.valdivieso@outlook.es</a>.</p>
      </section>"""
        return render_legal_page(
            "Privacy Policy",
            "Privacy policy, cookie usage, and Google AdSense compliance for Dojo Shōgi Online (dojoshogi.online).",
            body,
            canonical_path="/privacy",
            lang="en",
            other_lang_url="/politica-de-privacidad",
        )

    body = """
      <h1>Política de Privacidad</h1>
      <p class="legal-updated">Última actualización: Noviembre de 2026</p>
      <section class="legal-section">
        <h2>1. Información general</h2>
        <p>En <strong>Dojo Shōgi Online (将棋)</strong> (<a href="https://www.dojoshogi.online">https://www.dojoshogi.online</a>), la privacidad de nuestros visitantes y jugadores es de suma importancia. Este documento describe los datos procesados y el cumplimiento con los estándares de <strong>Google AdSense</strong>.</p>
      </section>
      <section class="legal-section">
        <h2>2. Datos de juego y almacenamiento local</h2>
        <p>Para facilitar las partidas multijugador sin registros obligatorios, Shōgi Dojo Online almacena en tu navegador (<code>localStorage</code> y <code>sessionStorage</code>) el apodo elegido y un token temporal de sesión.</p>
      </section>
      <section class="legal-section">
        <h2>3. Cookies y Publicidad de Google AdSense</h2>
        <p>Este sitio utiliza <strong>Google AdSense</strong> (<code>ca-pub-4665232577336299</code>). Los usuarios pueden configurar sus preferencias de anuncios en <a href="https://adssettings.google.com/" target="_blank" rel="noopener noreferrer">Configuración de anuncios de Google</a>.</p>
      </section>
      <section class="legal-section">
        <h2>4. Contacto</h2>
        <p>Para cualquier consulta sobre esta Política de Privacidad, escríbenos a <a href="mailto:hjavier.valdivieso@outlook.es">hjavier.valdivieso@outlook.es</a>.</p>
      </section>"""
    return render_legal_page(
        "Política de Privacidad",
        "Política de privacidad, uso de cookies y configuración de Google AdSense de Dojo Shōgi Online (dojoshogi.online).",
        body,
        canonical_path="/politica-de-privacidad",
        lang="es",
        other_lang_url="/privacy",
    )


@seo_bp.route("/terminos-de-servicio")
@seo_bp.route("/terms")
def page_terminos():
    is_en = request.path == "/terms" or request.args.get("lang") == "en"
    if is_en:
        body = """
      <h1>Terms of Service &amp; Legal Notice</h1>
      <p class="legal-updated">Last updated: November 2026</p>
      <section class="legal-section">
        <h2>1. Service Nature</h2>
        <p><strong>Dojo Shōgi Online</strong> (<a href="https://www.dojoshogi.online">https://www.dojoshogi.online</a>) is a free community platform dedicated to learning and playing Shōgi online in real-time.</p>
      </section>
      <section class="legal-section">
        <h2>2. Lobby Conduct &amp; Fair Play</h2>
        <p>Users agree not to use offensive nicknames, commercial spam, or automated denial-of-service scripts against matchmaking streams or game APIs.</p>
      </section>
      <section class="legal-section">
        <h2>3. Open Source &amp; MIT License</h2>
        <p>Distributed under the <strong>MIT License</strong> on GitHub (<a href="https://github.com/valdivieso01/shogi-web" target="_blank" rel="noopener noreferrer">valdivieso01/shogi-web</a>).</p>
      </section>"""
        return render_legal_page(
            "Terms of Service",
            "Terms and conditions of use for Dojo Shōgi Online (dojoshogi.online).",
            body,
            canonical_path="/terms",
            lang="en",
            other_lang_url="/terminos-de-servicio",
        )

    body = """
      <h1>Términos de Servicio y Aviso Legal</h1>
      <p class="legal-updated">Última actualización: Noviembre de 2026</p>
      <section class="legal-section">
        <h2>1. Naturaleza del servicio</h2>
        <p><strong>Dojo Shōgi Online</strong> (<a href="https://www.dojoshogi.online">https://www.dojoshogi.online</a>) es una plataforma educativa y recreativa gratuita para aprender y jugar al Shōgi en línea.</p>
      </section>
      <section class="legal-section">
        <h2>2. Conducta en el Lobby y Salas de Juego</h2>
        <p>El usuario se compromete a no utilizar lenguaje ofensivo, spam publicitario ni scripts automatizados contra los flujos en tiempo real.</p>
      </section>
      <section class="legal-section">
        <h2>3. Propiedad intelectual y Licencia MIT</h2>
        <p>El código fuente se distribuye bajo la <strong>Licencia MIT</strong> en GitHub (<a href="https://github.com/valdivieso01/shogi-web" target="_blank" rel="noopener noreferrer">valdivieso01/shogi-web</a>).</p>
      </section>"""
    return render_legal_page(
        "Términos de Servicio",
        "Términos y condiciones de uso del sitio web y Lobby multijugador Dojo Shōgi Online (dojoshogi.online).",
        body,
        canonical_path="/terminos-de-servicio",
        lang="es",
        other_lang_url="/terms",
    )


@seo_bp.route("/api/bug-report", methods=["POST"])
def submit_bug_report():
    ip = get_client_ip()
    if not SECURITY.check_rate_limit(ip, "bug_report", max_calls=5, window_sec=300):
        return jsonify({"error": "Has enviado demasiados reportes recientemente. Intenta en unos minutos."}), 429

    data = request.get_json(silent=True) or {}
    category = sanitize_text(data.get("category"), max_len=40, default="general")
    description = sanitize_text(data.get("description"), max_len=800, default="")
    contact = sanitize_text(data.get("contact"), max_len=80, default="")
    context_info = sanitize_text(data.get("context"), max_len=400, default="")
    player_name = sanitize_text(data.get("player_name"), max_len=24, default="Anónimo")

    if len(description) < 5:
        return jsonify({"error": "Por favor escribe una descripción de al menos 5 caracteres."}), 400

    report_entry = {
        "id": secrets.token_hex(4).upper(),
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "ip": ip,
        "player_name": player_name,
        "category": category,
        "description": description,
        "contact": contact,
        "context": context_info,
    }

    print(f"[BUG_REPORT] {json.dumps(report_entry, ensure_ascii=False)}", flush=True)
    base_dir = "/tmp" if os.environ.get("VERCEL") else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    reports_path = os.path.join(base_dir, "bug_reports.jsonl")
    try:
        with open(reports_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(report_entry, ensure_ascii=False) + "\n")
    except OSError:
        pass

    return jsonify({"ok": True, "report_id": report_entry["id"]})
