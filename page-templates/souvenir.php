<?php
/*
 * Template name: Сувенирная продукция
 *
 * Landing page: grid of top-level gift categories with subcategory hover panel.
 */

/* ── SVG icon selector (matches Russian category keywords) ───────────────── */
function gifts_cat_svg( string $name ): string {
    $n = mb_strtolower( $name, 'UTF-8' );

    // Pen / pencil
    if ( mb_strpos( $n, 'ручк' ) !== false || mb_strpos( $n, 'карандаш' ) !== false ) {
        return '<svg viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M14 42l5-14 22-22 9 9-22 22-14 5zm5-14 9 9" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M36 6l9 9" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>';
    }
    // Notebook / planner
    if ( mb_strpos( $n, 'ежедневник' ) !== false || mb_strpos( $n, 'блокнот' ) !== false || mb_strpos( $n, 'тетрад' ) !== false ) {
        return '<svg viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="12" y="8" width="32" height="40" rx="3" stroke="currentColor" stroke-width="2.5"/><path d="M20 8v40M26 18h12M26 25h12M26 32h8" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>';
    }
    // Umbrella
    if ( mb_strpos( $n, 'зонт' ) !== false ) {
        return '<svg viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M28 10C16 10 10 20 10 28h36c0-8-6-18-18-18z" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/><path d="M28 28v16a4 4 0 01-8 0" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><path d="M10 28c3 0 5 2 9 2s6-2 9-2 6 2 9 2 6-2 9-2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    }
    // Clothing / shirt
    if ( mb_strpos( $n, 'одежд' ) !== false || mb_strpos( $n, 'футболк' ) !== false || mb_strpos( $n, 'принт' ) !== false || mb_strpos( $n, 'коллекц' ) !== false ) {
        return '<svg viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 8l-10 8 6 4v24h24V20l6-4-10-8" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M20 8c0 4.4 3.6 8 8 8s8-3.6 8-8" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>';
    }
    // Bag / backpack
    if ( mb_strpos( $n, 'сумк' ) !== false || mb_strpos( $n, 'рюкзак' ) !== false || mb_strpos( $n, 'портфел' ) !== false ) {
        return '<svg viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="10" y="20" width="36" height="26" rx="4" stroke="currentColor" stroke-width="2.5"/><path d="M20 20v-4a8 8 0 1116 0v4" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><path d="M10 32h36M22 32v4" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>';
    }
    // Mug / cup / tableware
    if ( mb_strpos( $n, 'посуд' ) !== false || mb_strpos( $n, 'кружк' ) !== false || mb_strpos( $n, 'стакан' ) !== false || mb_strpos( $n, 'термос' ) !== false ) {
        return '<svg viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M14 16h28l-4 28H18L14 16z" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M38 22h5a4 4 0 010 8h-5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><path d="M14 16h28" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>';
    }
    // Electronics / gadgets
    if ( mb_strpos( $n, 'электроник' ) !== false || mb_strpos( $n, 'гаджет' ) !== false || mb_strpos( $n, 'флешк' ) !== false || mb_strpos( $n, 'power' ) !== false ) {
        return '<svg viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="16" y="8" width="24" height="40" rx="4" stroke="currentColor" stroke-width="2.5"/><circle cx="28" cy="40" r="2" fill="currentColor"/><path d="M23 14h10" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>';
    }
    // Sport
    if ( mb_strpos( $n, 'спортивн' ) !== false || mb_strpos( $n, 'спорт' ) !== false ) {
        return '<svg viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="28" cy="28" r="18" stroke="currentColor" stroke-width="2.5"/><path d="M14 20c4 2 8 2 14 0s10-2 14 0M14 36c4-2 8-2 14 0s10 2 14 0M28 10v36" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    }
    // House / home
    if ( mb_strpos( $n, 'дом' ) !== false || mb_strpos( $n, 'домашн' ) !== false ) {
        return '<svg viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 26l20-18 20 18M14 22v22h10v-12h8v12h10V22" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    }
    // Leisure / rest
    if ( mb_strpos( $n, 'отдых' ) !== false || mb_strpos( $n, 'туризм' ) !== false ) {
        return '<svg viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="28" cy="20" r="8" stroke="currentColor" stroke-width="2.5"/><path d="M8 44c3-8 10-14 20-14s17 6 20 14M20 30l-4 14M36 30l4 14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>';
    }
    // Award / trophy
    if ( mb_strpos( $n, 'награ' ) !== false || mb_strpos( $n, 'трофей' ) !== false || mb_strpos( $n, 'медал' ) !== false ) {
        return '<svg viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M18 8h20v18a10 10 0 01-20 0V8z" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/><path d="M18 16H10l4 10M38 16h8l-4 10M28 36v8M20 44h16" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    }
    // Packaging
    if ( mb_strpos( $n, 'упаковк' ) !== false || mb_strpos( $n, 'упаков' ) !== false ) {
        return '<svg viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 18l20-10 20 10v20l-20 10L8 38V18z" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/><path d="M8 18l20 10M48 18L28 28M28 28v20M18 13l20 10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    }
    // Gift set / набор
    if ( mb_strpos( $n, 'набор' ) !== false || mb_strpos( $n, 'сет' ) !== false ) {
        return '<svg viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="8" y="24" width="40" height="24" rx="2" stroke="currentColor" stroke-width="2.5"/><rect x="14" y="16" width="28" height="8" rx="2" stroke="currentColor" stroke-width="2.5"/><path d="M28 16c0-4-4-8-4-8s-2 6 4 8M28 16c0-4 4-8 4-8s2 6-4 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M28 16v32" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    }
    // Holiday souvenirs / праздники
    if ( mb_strpos( $n, 'праздник' ) !== false || mb_strpos( $n, 'сувенир' ) !== false || mb_strpos( $n, 'новый год' ) !== false ) {
        return '<svg viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M28 6l4 9 10 1-7 7 2 10-9-5-9 5 2-10-7-7 10-1 4-9z" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M18 44h20M28 40v8" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>';
    }
    // Leather / accessories
    if ( mb_strpos( $n, 'кож' ) !== false || mb_strpos( $n, 'аксессуар' ) !== false ) {
        return '<svg viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="8" y="18" width="40" height="26" rx="4" stroke="currentColor" stroke-width="2.5"/><path d="M22 18v-4a6 6 0 0112 0v4M20 31h16" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>';
    }
    // Merch / branding / stamp
    if ( mb_strpos( $n, 'мерч' ) !== false || mb_strpos( $n, 'бренд' ) !== false || mb_strpos( $n, 'элемент' ) !== false || mb_strpos( $n, 'кастомиз' ) !== false ) {
        return '<svg viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="14" y="30" width="28" height="14" rx="2" stroke="currentColor" stroke-width="2.5"/><rect x="18" y="14" width="20" height="16" rx="2" stroke="currentColor" stroke-width="2.5"/><path d="M22 30v-4M34 30v-4M14 38h28" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>';
    }
    // Edible / food
    if ( mb_strpos( $n, 'съедобн' ) !== false || mb_strpos( $n, 'еда' ) !== false || mb_strpos( $n, 'шоколад' ) !== false ) {
        return '<svg viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="10" y="16" width="36" height="28" rx="4" stroke="currentColor" stroke-width="2.5"/><path d="M10 26h36M22 16v28M34 16v28M10 36h36" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    }
    // Corporate gift (generic gift box — default for corporate)
    if ( mb_strpos( $n, 'корпоратив' ) !== false || mb_strpos( $n, 'подарок' ) !== false || mb_strpos( $n, 'подарочн' ) !== false ) {
        return '<svg viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="8" y="24" width="40" height="26" rx="2" stroke="currentColor" stroke-width="2.5"/><rect x="12" y="16" width="32" height="8" rx="2" stroke="currentColor" stroke-width="2.5"/><path d="M28 16v34M18 10c0 0-2 6 10 6M38 10c0 0 2 6-10 6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    }
    // Default gift icon
    return '<svg viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="8" y="24" width="40" height="26" rx="2" stroke="currentColor" stroke-width="2.5"/><rect x="12" y="16" width="32" height="8" rx="2" stroke="currentColor" stroke-width="2.5"/><path d="M28 16v34M18 10c0 0-2 6 10 6M38 10c0 0 2 6-10 6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}

/* ── Color palette (cycles by category index) ────────────────────────────── */
$scat_palettes = [
    [ 'bg' => '#eef3fb', 'clr' => '#3a6db5' ],
    [ 'bg' => '#f2eefb', 'clr' => '#6b47b8' ],
    [ 'bg' => '#eef8f3', 'clr' => '#27936b' ],
    [ 'bg' => '#fef4ea', 'clr' => '#c96a18' ],
    [ 'bg' => '#fef0ee', 'clr' => '#c94030' ],
    [ 'bg' => '#edf8f6', 'clr' => '#148c77' ],
    [ 'bg' => '#fefaed', 'clr' => '#b8900e' ],
    [ 'bg' => '#fdeef6', 'clr' => '#b02f7e' ],
];

/* ── Data: top-level categories + child terms ────────────────────────────── */
$top_cats = get_terms( [
    'taxonomy'   => 'gift_cat',
    'parent'     => 0,
    'hide_empty' => false,
    'orderby'    => 'name',
    'order'      => 'ASC',
] );

get_header();
?>

<style>
/* ══════════════════════════════════════════════════════
   Souvenirs landing page
══════════════════════════════════════════════════════ */

.souvenirs-h1 { margin-bottom: 8px; }
.souvenirs-intro {
    color: #666; font-size: 15px; max-width: 640px;
    margin-bottom: 36px; line-height: 1.6;
}

/* ── Grid ───────────────────────────────────────────── */
.souvenirs-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 20px;
    margin-bottom: 48px;
}
@media (max-width: 1100px) { .souvenirs-grid { grid-template-columns: repeat(3, 1fr); } }
@media (max-width: 760px)  { .souvenirs-grid { grid-template-columns: repeat(2, 1fr); gap: 14px; } }
@media (max-width: 420px)  { .souvenirs-grid { grid-template-columns: 1fr; } }

/* ── Card ───────────────────────────────────────────── */
.scat-card {
    position: relative;
    height: 290px;
    border-radius: 16px;
    overflow: hidden;
    border: 1.5px solid #e8ecf4;
    background: #fff;
    display: block;
    cursor: pointer;
    transition: box-shadow .25s, border-color .25s;
}
.scat-card:hover {
    box-shadow: 0 8px 32px rgba(60,90,160,.13);
    border-color: #c6d4ed;
}

/* Icon area */
.scat-icon-wrap {
    height: 158px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform .3s;
}
.scat-icon-wrap svg {
    width: 72px;
    height: 72px;
    transition: transform .3s;
}
.scat-card:hover .scat-icon-wrap svg {
    transform: scale(1.08);
}

/* Bottom info (always visible) */
.scat-info {
    padding: 12px 16px 10px;
    height: 132px;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    background: #fff;
}
.scat-name {
    font-size: 14px;
    font-weight: 700;
    color: #1a2540;
    line-height: 1.35;
    margin-bottom: 4px;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}
.scat-count {
    font-size: 12px;
    color: #999;
    margin-bottom: 8px;
}
.scat-sub-preview {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
}
.scat-sub-pill {
    font-size: 11px;
    color: #5c7db8;
    background: #eef3fb;
    border-radius: 4px;
    padding: 2px 7px;
    white-space: nowrap;
    max-width: 100px;
    overflow: hidden;
    text-overflow: ellipsis;
}
.scat-sub-more {
    font-size: 11px;
    color: #fff;
    background: #4b80c4;
    border-radius: 4px;
    padding: 2px 7px;
    font-weight: 600;
    white-space: nowrap;
    flex-shrink: 0;
}

/* ── Hover popup (slides up over card) ────────────── */
.scat-popup {
    position: absolute;
    top: 0; right: 0; bottom: 0; left: 0;
    background: #fff;
    transform: translateY(100%);
    transition: transform .32s cubic-bezier(.4,0,.2,1);
    display: flex;
    flex-direction: column;
    padding: 16px 18px 14px;
    overflow: hidden;
}
.scat-card:hover .scat-popup {
    transform: translateY(0);
}

.scat-popup-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 6px;
    margin-bottom: 12px;
    flex-shrink: 0;
}
.scat-popup-title {
    font-size: 14px;
    font-weight: 700;
    color: #1a2540;
    line-height: 1.35;
    text-decoration: none;
    flex: 1;
}
.scat-popup-title:hover { color: #4b80c4; }
.scat-popup-arrow {
    font-size: 16px;
    color: #4b80c4;
    flex-shrink: 0;
    margin-top: 1px;
    text-decoration: none;
}
.scat-popup-arrow:hover { color: #3a6db5; }

.scat-popup-list {
    list-style: none;
    margin: 0;
    padding: 0;
    overflow-y: auto;
    flex: 1;
    -ms-overflow-style: none;
    scrollbar-width: thin;
    scrollbar-color: #c5d4ed #f5f7fc;
}
.scat-popup-list li {
    border-bottom: 1px solid #f0f3f9;
}
.scat-popup-list li:last-child { border-bottom: none; }
.scat-popup-list a {
    display: block;
    padding: 7px 2px;
    font-size: 13px;
    color: #2c3e6a;
    text-decoration: none;
    transition: color .15s, padding-left .15s;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.scat-popup-list a:hover {
    color: #4b80c4;
    padding-left: 6px;
}

/* Count badge in popup head */
.scat-popup-cnt {
    font-size: 11px;
    color: #aaa;
    margin-top: 2px;
    flex-shrink: 0;
}
</style>

<section class="main-block souvenirs-landing">
    <?php get_template_part( 'template-parts/breadcrumbs' ); ?>

    <h1 class="souvenirs-h1"><?php the_title(); ?></h1>

    <?php if ( get_the_content() ) : ?>
    <div class="souvenirs-intro post"><?php the_content(); ?></div>
    <?php else : ?>
    <div class="souvenirs-intro">
        Брендированные сувениры и корпоративные подарки с нанесением логотипа.
        Выберите категорию — подберём и оформим под ваш стиль.
    </div>
    <?php endif; ?>

    <?php if ( ! empty( $top_cats ) && ! is_wp_error( $top_cats ) ) : ?>
    <div class="souvenirs-grid">
        <?php foreach ( $top_cats as $ci => $term ) :
            if ( is_wp_error( get_term_link( $term ) ) ) continue;

            $palette = $scat_palettes[ $ci % count( $scat_palettes ) ];
            $cat_url = get_term_link( $term );
            $svg     = gifts_cat_svg( $term->name );
            $count   = (int) $term->count;

            // Child terms
            $children = get_terms( [
                'taxonomy'   => 'gift_cat',
                'parent'     => $term->term_id,
                'hide_empty' => false,
                'orderby'    => 'count',
                'order'      => 'DESC',
                'number'     => 40,
            ] );
            if ( is_wp_error( $children ) ) $children = [];

            $preview = array_slice( $children, 0, 3 );
            $extra   = max( 0, count( $children ) - 3 );

            // Total products = direct count + all descendants
            $desc_ids = get_term_children( $term->term_id, 'gift_cat' );
            if ( $desc_ids && ! is_wp_error( $desc_ids ) ) {
                foreach ( $desc_ids as $desc_id ) {
                    $desc_term = get_term( $desc_id, 'gift_cat' );
                    if ( $desc_term && ! is_wp_error( $desc_term ) ) {
                        $count += (int) $desc_term->count;
                    }
                }
            }
        ?>
        <div class="scat-card">

            <!-- Icon area -->
            <a class="scat-icon-wrap" href="<?php echo esc_url( $cat_url ); ?>"
               style="background:<?php echo esc_attr( $palette['bg'] ); ?>; color:<?php echo esc_attr( $palette['clr'] ); ?>;">
                <?php echo $svg; ?>
            </a>

            <!-- Always-visible info -->
            <div class="scat-info">
                <div class="scat-name"><?php echo esc_html( $term->name ); ?></div>
                <?php if ( $count > 0 ) : ?>
                <div class="scat-count"><?php echo $count; ?> товаров</div>
                <?php endif; ?>
                <?php if ( $preview ) : ?>
                <div class="scat-sub-preview">
                    <?php foreach ( $preview as $ch ) : ?>
                    <span class="scat-sub-pill"><?php echo esc_html( $ch->name ); ?></span>
                    <?php endforeach; ?>
                    <?php if ( $extra > 0 ) : ?>
                    <span class="scat-sub-more">+<?php echo $extra; ?></span>
                    <?php endif; ?>
                </div>
                <?php endif; ?>
            </div>

            <!-- Hover popup — all subcategories -->
            <?php if ( $children ) : ?>
            <div class="scat-popup">
                <div class="scat-popup-head">
                    <a class="scat-popup-title" href="<?php echo esc_url( $cat_url ); ?>"><?php echo esc_html( $term->name ); ?></a>
                    <a class="scat-popup-arrow" href="<?php echo esc_url( $cat_url ); ?>" title="Все товары" aria-label="Перейти в категорию">→</a>
                </div>
                <ul class="scat-popup-list">
                    <?php foreach ( $children as $ch ) :
                        $ch_url = get_term_link( $ch );
                        if ( is_wp_error( $ch_url ) ) continue;
                    ?>
                    <li>
                        <a href="<?php echo esc_url( $ch_url ); ?>"><?php echo esc_html( $ch->name ); ?><?php if ( $ch->count ) echo ' <span style="color:#bbb;font-size:11px">(' . $ch->count . ')</span>'; ?></a>
                    </li>
                    <?php endforeach; ?>
                </ul>
            </div>
            <?php else : ?>
            <div class="scat-popup">
                <div class="scat-popup-head">
                    <a class="scat-popup-title" href="<?php echo esc_url( $cat_url ); ?>"><?php echo esc_html( $term->name ); ?></a>
                    <a class="scat-popup-arrow" href="<?php echo esc_url( $cat_url ); ?>" aria-label="Перейти">→</a>
                </div>
                <p style="font-size:13px;color:#aaa;margin:0">
                    <?php echo $count > 0 ? "Смотреть все {$count} товаров →" : 'Скоро появятся товары'; ?>
                </p>
            </div>
            <?php endif; ?>

        </div>
        <?php endforeach; ?>
    </div>
    <?php else : ?>
    <p>Каталог сувенирной продукции скоро появится.</p>
    <?php endif; ?>

</section>

<?php get_footer(); ?>
