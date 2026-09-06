<?php
/**
 * Single gift product page — color + size variant model
 */

$post_id    = get_the_ID();
$gifts_id   = get_post_meta( $post_id, '_gifts_id', true );
$base_price = gifts_get_min_price( $post_id );  // _gift_price (min across all variants)

// ── Color variants (new format) ───────────────────────────────────────────────
$cv_raw         = get_post_meta( $post_id, '_gift_color_variants', true );
$color_variants = [];
if ( $cv_raw ) {
    $d = json_decode( $cv_raw, true );
    if ( is_array( $d ) ) $color_variants = $d;
}

// ── Fallback: old _gift_variants format (before re-import) ───────────────────
if ( empty( $color_variants ) ) {
    $old_raw = get_post_meta( $post_id, '_gift_variants', true );
    if ( $old_raw ) {
        $old = json_decode( $old_raw, true );
        if ( is_array( $old ) && $old ) {
            $img_path  = get_post_meta( $post_id, '_gift_image', true );
            $imgs_raw  = get_post_meta( $post_id, '_gift_images', true );
            $old_imgs  = $imgs_raw ? (array) json_decode( $imgs_raw, true ) : [];
            if ( ! $old_imgs && $img_path ) $old_imgs = [ $img_path ];
            $old_sizes = [];
            foreach ( $old as $v ) {
                $old_sizes[] = [
                    'vid'       => (int) ( $v['id'] ?? 0 ),
                    'size_code' => (string) ( $v['size_code'] ?? $v['name'] ?? '' ),
                    'price'     => (float) ( $v['price'] ?? 0 ),
                    'stock'     => 0,
                ];
            }
            $color_variants = [ [
                'gifts_id' => (int) $gifts_id,
                'color'    => '',
                'name'     => get_the_title(),
                'images'   => $old_imgs,
                'sizes'    => $old_sizes,
            ] ];
        }
    }
}

// ── Stock map: variant_id → qty ───────────────────────────────────────────────
$sm_raw    = get_post_meta( $post_id, '_gift_stock_map', true );
$stock_map = [];
if ( $sm_raw ) {
    $d = json_decode( $sm_raw, true );
    if ( is_array( $d ) ) $stock_map = $d;
}

// ── Product characteristics ───────────────────────────────────────────────────
$props_raw = get_post_meta( $post_id, '_gift_props', true );
$props     = [];
if ( $props_raw ) {
    $d = json_decode( $props_raw, true );
    if ( is_array( $d ) ) $props = $d;
}

// ── Build JS-ready color data (resolve local image URLs) ─────────────────────
$js_colors    = [];
$multi_colors = count( $color_variants ) > 1;

foreach ( $color_variants as $cv ) {
    // Resolve + deduplicate images for this color
    $seen_imgs  = [];
    $local_imgs = [];
    foreach ( $cv['images'] ?? [] as $img_path ) {
        if ( empty( $img_path ) ) continue;
        $dedup = preg_replace( '/\d{3,5}x\d{3,5}/', 'NxN', $img_path );
        if ( isset( $seen_imgs[ $dedup ] ) ) continue;
        $seen_imgs[ $dedup ] = true;
        $cdn_path    = ( strpos( $img_path, 'http' ) === 0 ) ? str_replace( GIFTS_CDN, '', $img_path ) : $img_path;
        $local_imgs[] = gifts_local_img( $cdn_path );
    }

    // Attach per-size stock from stock_map
    $sizes_js = [];
    foreach ( $cv['sizes'] ?? [] as $sz ) {
        $vid        = (int) ( $sz['vid'] ?? 0 );
        $sizes_js[] = [
            'vid'       => $vid,
            'size_code' => (string) ( $sz['size_code'] ?? '' ),
            'price'     => (float) ( $sz['price'] ?? 0 ),
            'stock'     => (int) ( $stock_map[ $vid ] ?? 0 ),
        ];
    }

    $js_colors[] = [
        'gifts_id' => (int) ( $cv['gifts_id'] ?? 0 ),
        'color'    => (string) ( $cv['color'] ?? '' ),
        'images'   => $local_imgs,
        'sizes'    => $sizes_js,
    ];
}

// ── Initial state (first color, first size) ───────────────────────────────────
$init_imgs   = $js_colors[0]['images'] ?? [];
$init_sizes  = $js_colors[0]['sizes']  ?? [];
$init_price  = ( $init_sizes && $init_sizes[0]['price'] > 0 ) ? $init_sizes[0]['price'] : $base_price;
$init_vid    = $init_sizes[0]['vid']   ?? 0;
$init_stock  = $init_sizes ? ( $init_sizes[0]['stock'] ?? 0 ) : (int) get_post_meta( $post_id, '_gift_stock', true );
$init_color  = $js_colors[0]['color']  ?? '';

$colors_json = wp_json_encode( $js_colors, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES );

// Prop labels map
$prop_labels = [
    'matherial'    => 'Материал',
    'sourcecountry'=> 'Страна',
    'product_size' => 'Размерный ряд',
    'barcode'      => 'Штрихкод',
    'vendor'       => 'Производитель',
    'vendorcode'   => 'Артикул производителя',
];

get_header();
?>

<style>
/* ════════════════════════════════════════════════
   Gift single — isolated styles (all prefixed)
════════════════════════════════════════════════ */

/* Fix theme's -40px margin */
.gift-product.product-card .product-card-right {
    margin-top: 0 !important;
}

/* ── Image gallery ─────────────────────────────── */
.gimg-wrap {
    width: 100%;
    background: #f5f6f8;
    border-radius: 16px;
    overflow: hidden;
    margin-bottom: 10px;
    line-height: 0;
}
.gimg-wrap > img,
#gift-main-img {
    width: 100% !important;
    height: auto !important;
    display: block !important;
    border-radius: 16px;
    transition: opacity .2s;
}
.gimg-thumbs {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
}
.gimg-thumb {
    width: 60px !important;
    height: 60px !important;
    padding: 2px !important;
    background: #f5f6f8 !important;
    border: 2px solid transparent !important;
    border-radius: 8px !important;
    cursor: pointer;
    overflow: hidden;
    transition: border-color .15s;
    flex-shrink: 0;
}
.gimg-thumb img {
    width: 100% !important;
    height: 100% !important;
    object-fit: contain !important;
    display: block !important;
}
.gimg-thumb.active,
.gimg-thumb:hover {
    border-color: #4b80c4 !important;
    background: #fff !important;
    opacity: 1 !important;
}

/* ── Article ───────────────────────────────────── */
.gift-art {
    font-size: 12px;
    color: #aaa;
    letter-spacing: .03em;
    margin: -2px 0 16px;
}

/* ── Section header ────────────────────────────── */
.gift-section-label {
    font-size: 13px;
    font-weight: 600;
    color: #555;
    margin: 0 0 8px;
    display: flex;
    gap: 6px;
    align-items: baseline;
}
.gift-section-value {
    font-weight: 400;
    color: #222;
}

/* ── Chips (shared for color + size) ───────────── */
.gift-chips-wrap {
    margin-bottom: 18px;
}
.gift-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}
.gift-chip {
    display: inline-flex !important;
    flex-direction: column !important;
    align-items: center !important;
    justify-content: center !important;
    min-width: 52px !important;
    padding: 9px 14px !important;
    background: #fff !important;
    color: #222 !important;
    border: 2px solid #e0e0e0 !important;
    border-radius: 8px !important;
    font-size: 14px !important;
    font-weight: 600 !important;
    line-height: 1.2 !important;
    cursor: pointer;
    transition: border-color .12s, background .12s, box-shadow .12s !important;
    white-space: nowrap;
    gap: 3px !important;
}
.gift-chip:hover {
    border-color: #4b80c4 !important;
    background: #f0f5fc !important;
    opacity: 1 !important;
}
.gift-chip.active {
    border-color: #4b80c4 !important;
    background: #eaf0fb !important;
    box-shadow: 0 0 0 3px rgba(75,128,196,.18) !important;
    color: #2c5fa0 !important;
    opacity: 1 !important;
}
.gift-chip.out-of-stock {
    opacity: .45 !important;
}
.gift-chip-sub {
    font-size: 11px !important;
    font-weight: 400 !important;
    color: #888 !important;
    display: block;
}
.gift-chip.active .gift-chip-sub {
    color: #5a85c0 !important;
}

/* ── Qty ───────────────────────────────────────── */
.gift-qty-row {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-top: 6px;
    flex-wrap: wrap;
}
.gift-qty-ctrl {
    display: flex;
    align-items: stretch;
    border-radius: 12px;
    overflow: hidden;
    border: 2px solid #e0e0e0;
    background: #fff;
}
.gift-qty-btn {
    width: 44px !important;
    height: 48px !important;
    padding: 0 !important;
    background: #f5f6f8 !important;
    color: #444 !important;
    border: none !important;
    border-radius: 0 !important;
    font-size: 22px !important;
    font-weight: 400 !important;
    line-height: 1 !important;
    cursor: pointer;
    transition: background .12s !important;
    flex-shrink: 0;
}
.gift-qty-btn:hover {
    background: #ebebeb !important;
    opacity: 1 !important;
}
#gift-qty {
    width: 58px;
    height: 48px;
    border: none;
    border-left: 2px solid #e0e0e0;
    border-right: 2px solid #e0e0e0;
    text-align: center;
    font-size: 18px;
    font-weight: 700;
    color: #222;
    background: #fff;
    -moz-appearance: textfield;
    padding: 0;
}
#gift-qty::-webkit-inner-spin-button,
#gift-qty::-webkit-outer-spin-button { -webkit-appearance: none; }
.gift-qty-total {
    font-size: 14px;
    color: #666;
    align-self: center;
}
.gift-qty-total strong {
    color: #111;
    font-size: 15px;
}

/* ── Price ─────────────────────────────────────── */
.gift-price-row {
    display: flex;
    align-items: baseline;
    gap: 6px;
}
.gift-price-unit {
    font-size: 14px;
    color: #888;
}

/* ── Stock ─────────────────────────────────────── */
.gift-stock {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
    margin-top: 2px;
}
.gift-stock::before {
    content: '';
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
}
.gift-stock--in  { color: #27ae60; }
.gift-stock--in::before  { background: #27ae60; }
.gift-stock--low { color: #e67e22; }
.gift-stock--low::before { background: #e67e22; }
.gift-stock--out { color: #aaa; }
.gift-stock--out::before { background: #ccc; }

/* ── Props table ───────────────────────────────── */
.gift-props {
    margin-top: 16px;
    border-top: 1px solid #eee;
    padding-top: 12px;
}
.gift-props table {
    width: 100%;
    font-size: 13px;
    border-collapse: collapse;
}
.gift-props td {
    padding: 5px 0;
    vertical-align: top;
}
.gift-props td:first-child {
    color: #888;
    width: 44%;
    padding-right: 10px;
}
</style>

<section class="product-card main-block product--js gift-product" data-post="<?php echo $post_id; ?>">
    <?php get_template_part( 'template-parts/breadcrumbs' ); ?>

    <!-- ── Left: configuration ──────────────────────────────────────────────── -->
    <div class="product-configuration product-card-left">

        <h1><?php the_title(); ?></h1>

        <?php if ( $gifts_id ) : ?>
        <div class="gift-art">Арт.&thinsp;<?php echo esc_html( $gifts_id ); ?></div>
        <?php endif; ?>

        <?php if ( $multi_colors ) : ?>
        <!-- ── Color selector ──────────────────────────────────────────────── -->
        <div class="configuration gift-chips-wrap">
            <div class="gift-section-label">
                Цвет:&nbsp;<span class="gift-section-value" id="gift-color-label"><?php echo esc_html( $init_color ); ?></span>
            </div>
            <div class="gift-chips" id="gift-color-chips">
                <?php foreach ( $js_colors as $ci => $jsc ) : ?>
                <button type="button"
                        class="gift-chip gift-color-chip<?php echo $ci === 0 ? ' active' : ''; ?>"
                        data-color-idx="<?php echo $ci; ?>">
                    <?php echo esc_html( $jsc['color'] ?: '—' ); ?>
                </button>
                <?php endforeach; ?>
            </div>
        </div>
        <?php endif; ?>

        <?php if ( $init_sizes ) : ?>
        <!-- ── Size selector ───────────────────────────────────────────────── -->
        <div class="configuration gift-chips-wrap" id="gift-sizes-wrap">
            <div class="gift-section-label">Размер</div>
            <div class="gift-chips" id="gift-size-chips">
                <?php foreach ( $init_sizes as $si => $sz ) :
                    $stock_cls = ( $sz['stock'] === 0 && $sm_raw ) ? ' out-of-stock' : '';
                ?>
                <button type="button"
                        class="gift-chip gift-size-chip<?php echo $si === 0 ? ' active' : ''; echo $stock_cls; ?>"
                        data-size-idx="<?php echo $si; ?>"
                        data-price="<?php echo (float) $sz['price']; ?>"
                        data-vid="<?php echo (int) $sz['vid']; ?>"
                        data-stock="<?php echo (int) $sz['stock']; ?>">
                    <?php echo esc_html( $sz['size_code'] ?: '—' ); ?>
                    <?php if ( $sz['price'] > 0 ) : ?>
                    <span class="gift-chip-sub"><?php echo number_format( $sz['price'], 0, '', ' ' ); ?>&nbsp;₽</span>
                    <?php endif; ?>
                </button>
                <?php endforeach; ?>
            </div>
        </div>
        <?php endif; ?>

        <!-- ── Qty ─────────────────────────────────────────────────────────── -->
        <div class="configuration configuration--js">
            <div class="h7">Количество</div>
            <div class="gift-qty-row">
                <div class="gift-qty-ctrl">
                    <button type="button" class="gift-qty-btn" data-dir="-1">−</button>
                    <input type="number" id="gift-qty" value="1" min="1" max="9999">
                    <button type="button" class="gift-qty-btn" data-dir="1">+</button>
                </div>
                <div class="gift-qty-total" id="gift-qty-total" style="display:none">
                    = <strong id="gift-qty-val"></strong>&nbsp;₽
                </div>
            </div>
        </div>

        <!-- Hidden cart / order fields -->
        <input type="hidden" id="gift-variant-id"    value="<?php echo $init_vid; ?>">
        <input type="hidden" id="gift-variant-label" value="">
        <input type="hidden" id="color-print"        value="">
        <select name="format" id="dc-format-sel" style="display:none" aria-hidden="true">
            <option value="Сувенирная продукция">Сувенирная продукция</option>
        </select>
        <input type="hidden" id="edition" name="edition" value="1">

        <?php if ( $props ) : ?>
        <!-- ── Characteristics ─────────────────────────────────────────────── -->
        <div class="gift-props">
            <table>
            <?php foreach ( $props as $key => $val ) :
                $label = $prop_labels[ $key ] ?? ucfirst( $key );
            ?>
                <tr><td><?php echo esc_html( $label ); ?></td><td><?php echo esc_html( $val ); ?></td></tr>
            <?php endforeach; ?>
            </table>
        </div>
        <?php endif; ?>

    </div><!-- /left -->

    <!-- ── Right: gallery + order ───────────────────────────────────────────── -->
    <div class="product-card-right">

        <!-- Image gallery -->
        <?php if ( $init_imgs ) : ?>
        <div class="gimg-wrap">
            <img id="gift-main-img"
                 src="<?php echo esc_url( $init_imgs[0] ); ?>"
                 alt="<?php the_title_attribute(); ?>"
                 loading="eager">
        </div>
        <div class="gimg-thumbs" id="gift-thumbs">
            <?php if ( count( $init_imgs ) > 1 ) : ?>
            <?php foreach ( $init_imgs as $i => $url ) : ?>
            <button type="button"
                    class="gimg-thumb<?php echo $i === 0 ? ' active' : ''; ?>"
                    data-src="<?php echo esc_url( $url ); ?>">
                <img src="<?php echo esc_url( $url ); ?>" alt="" loading="<?php echo $i === 0 ? 'eager' : 'lazy'; ?>">
            </button>
            <?php endforeach; ?>
            <?php endif; ?>
        </div>
        <?php else : ?>
        <div class="gimg-wrap" style="padding:40px;text-align:center;">
            <svg viewBox="0 0 64 64" fill="none" style="width:80px;height:80px;opacity:.2;display:inline-block">
                <rect x="4" y="12" width="56" height="40" rx="4" stroke="#999" stroke-width="2"/>
                <circle cx="22" cy="26" r="5" stroke="#999" stroke-width="2"/>
                <path d="M4 42l14-12 10 10 8-8 14 10" stroke="#999" stroke-width="2" stroke-linejoin="round"/>
            </svg>
        </div>
        <div class="gimg-thumbs" id="gift-thumbs"></div>
        <?php endif; ?>

        <!-- Order block -->
        <div class="product-order-block">
            <meta itemprop="price"         content="<?php echo $base_price; ?>">
            <meta itemprop="priceCurrency" content="RUB">

            <div class="top">
                <div>
                    <div class="gift-price-row">
                        <div class="product-price price--js"
                             data-unit="<?php echo $init_price; ?>"
                             data-total="<?php echo $init_price; ?>">
                            <?php echo $init_price > 0 ? esc_html( number_format( $init_price, 0, '', ' ' ) ) : '—'; ?>
                        </div>
                        <span class="gift-price-unit">₽&nbsp;/ шт.</span>
                    </div>
                    <?php
                    $cls = $init_stock > 100 ? 'in' : ( $init_stock > 0 ? 'low' : 'out' );
                    $lbl = $init_stock > 100 ? 'В наличии' : ( $init_stock > 0 ? "Осталось {$init_stock}\u{a0}шт." : 'Под заказ' );
                    ?>
                    <div class="gift-stock gift-stock--<?php echo $cls; ?>" id="gift-stock-display">
                        <?php echo esc_html( $lbl ); ?>
                    </div>
                </div>
            </div>

            <div class="button button-order button-order--js" animation="ripple">Заказать</div>
        </div>

        <div class="delivery-info">
            <picture>
                <source srcset="<?php echo THEME_URI; ?>/assets/images/boxberry@2x.webp 2x" type="image/webp">
                <img srcset="<?php echo THEME_URI; ?>/assets/images/boxberry@2x.png 2x, <?php echo THEME_URI; ?>/assets/images/boxberry.png 1x"
                     src="<?php echo THEME_URI; ?>/assets/images/boxberry.png" alt="" width="100" height="29">
            </picture>
            Доставка по всей России — транспортными компаниями и курьером
        </div>

    </div><!-- /right -->

    <div class="loader loader-bg loader--js"></div>
</section>

<!-- Full description below the card -->
<?php if ( get_the_content() ) : ?>
<section class="post content-post-wrap main-block">
    <?php the_content(); ?>
</section>
<?php endif; ?>

<script>
(function () {
    'use strict';

    var COLORS    = <?php echo $colors_json ?: '[]'; ?>;
    var BASE      = <?php echo (float) $base_price; ?>;
    var HAS_STOCK = <?php echo $sm_raw ? 'true' : 'false'; ?>; // stock data available

    var colorIdx = 0;
    var sizeIdx  = 0;
    var unit     = <?php echo (float) $init_price; ?> || BASE;

    /* ── Helpers ──────────────────────────────────────────────────────────── */
    function getColor() { return COLORS[colorIdx] || {}; }
    function getSizes() { return (getColor().sizes) || []; }
    function getSize()  { return getSizes()[sizeIdx] || null; }
    function fmt(n)     { return Math.round(n).toLocaleString('ru-RU'); }
    function qty()      {
        var el = document.getElementById('gift-qty');
        return Math.max(1, parseInt(el ? el.value : '1', 10) || 1);
    }

    /* ── Price + stock update ─────────────────────────────────────────────── */
    function updatePriceStock() {
        var s     = getSize();
        unit      = s ? (s.price || BASE) : BASE;
        var stock = s ? s.stock : 0;

        var elPrice = document.querySelector('.price--js');
        if (elPrice) {
            elPrice.textContent   = unit > 0 ? fmt(unit) : '—';
            elPrice.dataset.unit  = unit;
            elPrice.dataset.total = unit * qty();
        }

        var elStock = document.getElementById('gift-stock-display');
        if (elStock) {
            var cls = stock > 100 ? 'in' : (stock > 0 ? 'low' : 'out');
            var lbl = stock > 100 ? 'В наличии' : (stock > 0 ? 'Осталось\u00a0' + stock + '\u00a0шт.' : 'Под заказ');
            if (!HAS_STOCK) { cls = 'in'; lbl = 'В наличии'; }
            elStock.className   = 'gift-stock gift-stock--' + cls;
            elStock.textContent = lbl;
        }

        var elVid  = document.getElementById('gift-variant-id');
        var elVlbl = document.getElementById('gift-variant-label');
        var elClr  = document.getElementById('color-print');
        if (s) {
            var lbl2 = (getColor().color || '') + (s.size_code ? ' / ' + s.size_code : '');
            if (elVid)  elVid.value  = s.vid || '';
            if (elVlbl) elVlbl.value = lbl2;
            if (elClr)  elClr.value  = lbl2;
        }

        refreshTotal();
    }

    function refreshTotal() {
        var q          = qty();
        var elTotal    = document.getElementById('gift-qty-total');
        var elTotalVal = document.getElementById('gift-qty-val');
        var elEdition  = document.getElementById('edition');
        if (elEdition) elEdition.value = q;
        if (elTotal && elTotalVal) {
            if (q > 1 && unit > 0) {
                elTotalVal.textContent = fmt(unit * q);
                elTotal.style.display  = '';
            } else {
                elTotal.style.display = 'none';
            }
        }
    }

    /* ── Gallery render ───────────────────────────────────────────────────── */
    function renderGallery(imgs) {
        var main      = document.getElementById('gift-main-img');
        var thumbsWrap = document.getElementById('gift-thumbs');
        if (!imgs || !imgs.length) return;

        if (main) {
            main.style.opacity = '.3';
            main.src = imgs[0];
            main.onload = function () { main.style.opacity = '1'; };
            main.onerror = function () { main.style.opacity = '1'; };
        }

        if (!thumbsWrap) return;
        thumbsWrap.innerHTML = '';
        if (imgs.length <= 1) return;

        imgs.forEach(function (url, i) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'gimg-thumb' + (i === 0 ? ' active' : '');
            btn.dataset.src = url;

            var img = document.createElement('img');
            img.src     = url;
            img.alt     = '';
            img.loading = i === 0 ? 'eager' : 'lazy';
            btn.appendChild(img);

            btn.addEventListener('click', function () {
                if (main) {
                    main.style.opacity = '.3';
                    main.src = url;
                    main.onload = function () { main.style.opacity = '1'; };
                }
                thumbsWrap.querySelectorAll('.gimg-thumb').forEach(function (b) { b.classList.remove('active'); });
                btn.classList.add('active');
            });
            thumbsWrap.appendChild(btn);
        });
    }

    /* ── Size chips render ────────────────────────────────────────────────── */
    function renderSizes(sizes) {
        var wrap = document.getElementById('gift-size-chips');
        var section = document.getElementById('gift-sizes-wrap');
        if (!wrap) return;

        if (!sizes || !sizes.length) {
            if (section) section.style.display = 'none';
            return;
        }
        if (section) section.style.display = '';

        wrap.innerHTML = '';
        sizes.forEach(function (s, i) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'gift-chip gift-size-chip' + (i === 0 ? ' active' : '');
            if (HAS_STOCK && s.stock === 0) btn.classList.add('out-of-stock');
            btn.dataset.sizeIdx = i;

            var lbl = document.createElement('span');
            lbl.textContent = s.size_code || '—';
            btn.appendChild(lbl);

            if (s.price > 0) {
                var sub = document.createElement('span');
                sub.className   = 'gift-chip-sub';
                sub.textContent = fmt(s.price) + '\u00a0₽';
                btn.appendChild(sub);
            }

            btn.addEventListener('click', function () {
                selectSize(i);
            });
            wrap.appendChild(btn);
        });
    }

    /* ── Color selection ──────────────────────────────────────────────────── */
    function selectColor(idx) {
        colorIdx = idx;
        sizeIdx  = 0;

        // Highlight active color chip
        document.querySelectorAll('.gift-color-chip').forEach(function (c, i) {
            c.classList.toggle('active', i === idx);
        });

        // Update label
        var lbl = document.getElementById('gift-color-label');
        if (lbl) lbl.textContent = COLORS[idx].color || '';

        // Rebuild size chips and gallery for new color
        renderSizes(getSizes());
        renderGallery(getColor().images || []);
        updatePriceStock();
    }

    /* ── Size selection ───────────────────────────────────────────────────── */
    function selectSize(idx) {
        sizeIdx = idx;
        document.querySelectorAll('.gift-size-chip').forEach(function (c, i) {
            c.classList.toggle('active', i === idx);
        });
        updatePriceStock();
    }

    /* ── Event bindings ───────────────────────────────────────────────────── */

    // Color chips (PHP-rendered)
    document.querySelectorAll('.gift-color-chip').forEach(function (chip, i) {
        chip.addEventListener('click', function () { selectColor(i); });
    });

    // Size chips (PHP-rendered initial set)
    document.querySelectorAll('.gift-size-chip').forEach(function (chip, i) {
        chip.addEventListener('click', function () { selectSize(i); });
    });

    // Qty buttons
    document.querySelectorAll('.gift-qty-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var el = document.getElementById('gift-qty');
            var v  = qty() + (parseInt(btn.dataset.dir, 10) || 0);
            if (v < 1) v = 1;
            if (el) el.value = v;
            refreshTotal();
        });
    });
    var elQty = document.getElementById('gift-qty');
    if (elQty) elQty.addEventListener('input', refreshTotal);

    // Gallery thumbs (PHP-rendered)
    document.querySelectorAll('.gimg-thumb').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var main = document.getElementById('gift-main-img');
            if (main) {
                main.style.opacity = '.3';
                main.src = btn.dataset.src;
                main.onload = function () { main.style.opacity = '1'; };
            }
            document.querySelectorAll('.gimg-thumb').forEach(function (b) { b.classList.remove('active'); });
            btn.classList.add('active');
        });
    });

    // Boot
    updatePriceStock();

})();
</script>

<?php get_footer(); ?>
