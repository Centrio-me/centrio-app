<?php
/**
 * Archive: gift_cat taxonomy
 * Category page — shows sub-categories + product grid.
 */

$term    = get_queried_object();
$term_id = $term ? $term->term_id : 0;

// Child categories
$child_terms = get_terms( [
    'taxonomy'   => 'gift_cat',
    'parent'     => $term_id,
    'hide_empty' => false,
    'orderby'    => 'count',
    'order'      => 'DESC',
] );
if ( is_wp_error( $child_terms ) ) $child_terms = [];

// Products query
$paged          = max( 1, get_query_var( 'paged' ) );
$show_products  = empty( $child_terms ) || isset( $_GET['all'] );
$products_query = null;

if ( $show_products ) {
    $products_query = new WP_Query( [
        'post_type'      => 'gift',
        'post_status'    => 'publish',
        'tax_query'      => [ [
            'taxonomy'         => 'gift_cat',
            'field'            => 'term_id',
            'terms'            => $term_id,
            'include_children' => true,
        ] ],
        'paged'          => $paged,
        'posts_per_page' => 36,
        'orderby'        => 'title',
        'order'          => 'ASC',
    ] );
}

get_header();
?>

<style>
/* ══════════════════════════════════════════════════
   Gift category archive
══════════════════════════════════════════════════ */

.gifts-cat-page { padding-bottom: 48px; }
.gifts-cat-page h1 { margin-bottom: 6px; }
.gifts-cat-desc { color: #666; font-size: 15px; margin-bottom: 24px; line-height: 1.6; max-width: 680px; }

/* ── Sub-category grid ────────────────────────────── */
.gc-subs-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
    gap: 16px;
    margin: 24px 0 32px;
}
.gc-sub-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: 20px 14px 16px;
    border-radius: 14px;
    border: 1.5px solid #e8ecf4;
    background: #fff;
    text-decoration: none;
    color: inherit;
    transition: box-shadow .2s, border-color .2s, transform .2s;
    gap: 10px;
}
.gc-sub-card:hover {
    box-shadow: 0 6px 24px rgba(60,90,160,.12);
    border-color: #b8cde8;
    transform: translateY(-2px);
}
.gc-sub-img {
    width: 80px;
    height: 80px;
    border-radius: 10px;
    overflow: hidden;
    background: #f2f5fc;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}
.gc-sub-img img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    padding: 6px;
}
.gc-sub-name {
    font-size: 13px;
    font-weight: 600;
    line-height: 1.35;
    color: #1a2540;
}
.gc-sub-count { font-size: 12px; color: #aaa; }

.gc-show-all {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 28px;
    font-size: 14px;
    color: #4b80c4;
    text-decoration: none;
    font-weight: 500;
    border: 1.5px solid #c6d8f0;
    border-radius: 8px;
    padding: 8px 18px;
    transition: background .15s, border-color .15s;
}
.gc-show-all:hover { background: #eef3fb; border-color: #9bbce0; }

/* ── Product grid ─────────────────────────────────── */
.gc-products-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 18px;
    margin-bottom: 32px;
}
@media (max-width: 1100px) { .gc-products-grid { grid-template-columns: repeat(3, 1fr); } }
@media (max-width: 720px)  { .gc-products-grid { grid-template-columns: repeat(2, 1fr); gap: 12px; } }
@media (max-width: 400px)  { .gc-products-grid { grid-template-columns: 1fr; } }

.gc-product-card {
    border-radius: 14px;
    border: 1.5px solid #e8ecf4;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    text-decoration: none;
    color: inherit;
    background: #fff;
    transition: box-shadow .2s, border-color .2s;
}
.gc-product-card:hover {
    box-shadow: 0 6px 24px rgba(60,90,160,.12);
    border-color: #c0d0e8;
}

.gc-product-img {
    position: relative;
    width: 100%;
    padding-top: 90%;
    background: #f5f7fb;
    overflow: hidden;
}
.gc-product-img img {
    position: absolute;
    top: 0; left: 0;
    width: 100%; height: 100%;
    object-fit: contain;
    padding: 10px;
    transition: transform .3s;
}
.gc-product-card:hover .gc-product-img img {
    transform: scale(1.04);
}
.gc-badge {
    position: absolute;
    top: 8px; left: 8px;
    background: rgba(30,40,80,.55);
    color: #fff;
    font-size: 10px;
    font-weight: 600;
    padding: 3px 7px;
    border-radius: 5px;
    letter-spacing: .02em;
}
.gc-colors-badge {
    position: absolute;
    top: 8px; right: 8px;
    background: rgba(255,255,255,.9);
    color: #4b80c4;
    font-size: 10px;
    font-weight: 700;
    padding: 3px 7px;
    border-radius: 5px;
    border: 1px solid #c6d8f0;
}

.gc-product-body {
    padding: 10px 12px 12px;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
}
.gc-product-title {
    font-size: 13px;
    font-weight: 600;
    line-height: 1.35;
    color: #1a2540;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}
.gc-product-price {
    font-size: 15px;
    font-weight: 700;
    color: #e55a2b;
    margin-top: auto;
    padding-top: 6px;
}
.gc-product-price span {
    font-size: 12px;
    font-weight: 400;
    color: #aaa;
}

/* ── Pagination ───────────────────────────────────── */
.gc-pagination {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    justify-content: center;
    margin-top: 24px;
}
.gc-pagination .page-numbers {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 38px; height: 38px;
    border-radius: 8px;
    border: 1.5px solid #e0e5f0;
    font-size: 14px;
    font-weight: 500;
    color: #3a567a;
    text-decoration: none;
    background: #fff;
    transition: background .15s, border-color .15s, color .15s;
}
.gc-pagination .page-numbers:hover,
.gc-pagination .page-numbers.current {
    background: #4b80c4;
    border-color: #4b80c4;
    color: #fff;
}
.gc-pagination .page-numbers.dots { border: none; background: none; color: #aaa; width: auto; }

.gc-empty { color: #aaa; font-size: 15px; text-align: center; padding: 60px 0; }
</style>

<section class="main-block gifts-cat-page">
    <?php get_template_part( 'template-parts/breadcrumbs' ); ?>

    <h1><?php echo $term ? esc_html( $term->name ) : 'Каталог сувениров'; ?></h1>

    <?php if ( $term && $term->description ) : ?>
    <div class="gifts-cat-desc"><?php echo wp_kses_post( $term->description ); ?></div>
    <?php endif; ?>

    <!-- ── Sub-categories ────────────────────────────────────────────────── -->
    <?php if ( $child_terms ) : ?>
    <div class="gc-subs-grid">
        <?php foreach ( $child_terms as $child ) :
            $ch_link = get_term_link( $child );
            if ( is_wp_error( $ch_link ) ) continue;

            // Representative image from first product
            $cat_img = '';
            $thumb_q = new WP_Query( [
                'post_type'      => 'gift',
                'post_status'    => 'publish',
                'tax_query'      => [ [ 'taxonomy' => 'gift_cat', 'terms' => $child->term_id ] ],
                'posts_per_page' => 1,
                'fields'         => 'ids',
            ] );
            if ( $thumb_q->posts ) {
                $img_path = get_post_meta( $thumb_q->posts[0], '_gift_image', true );
                if ( $img_path ) {
                    $local = gifts_local_img( $img_path );
                    if ( $local ) $cat_img = $local;
                }
            }
            wp_reset_postdata();
        ?>
        <a href="<?php echo esc_url( $ch_link ); ?>" class="gc-sub-card">
            <div class="gc-sub-img">
                <?php if ( $cat_img ) : ?>
                <img src="<?php echo esc_url( $cat_img ); ?>" alt="<?php echo esc_attr( $child->name ); ?>" loading="lazy">
                <?php else : ?>
                <svg viewBox="0 0 48 48" fill="none" style="width:36px;height:36px;color:#cdd7ea">
                    <rect x="6" y="18" width="36" height="22" rx="3" stroke="currentColor" stroke-width="2"/>
                    <path d="M24 8a6 6 0 100 10 6 6 0 000-10zM24 18H6l5-10h13v10zM24 18h18l-5-10H24v10z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
                </svg>
                <?php endif; ?>
            </div>
            <div class="gc-sub-name"><?php echo esc_html( $child->name ); ?></div>
            <?php if ( $child->count > 0 ) : ?>
            <div class="gc-sub-count"><?php echo $child->count; ?> тов.</div>
            <?php endif; ?>
        </a>
        <?php endforeach; ?>
    </div>

    <a href="?all=1" class="gc-show-all">
        <svg viewBox="0 0 18 18" fill="none" width="16" height="16"><rect x="1" y="1" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="11" y="1" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="1" y="11" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="11" y="11" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.5"/></svg>
        Все товары этой категории
    </a>
    <?php endif; ?>

    <!-- ── Products ──────────────────────────────────────────────────────── -->
    <?php if ( $products_query && $products_query->have_posts() ) : ?>
    <div class="gc-products-grid">
        <?php while ( $products_query->have_posts() ) : $products_query->the_post();
            $pid   = get_the_ID();
            $price = gifts_get_min_price( $pid );

            // Image: use locally cached version
            $img_path = get_post_meta( $pid, '_gift_image', true );
            $img_url  = $img_path ? gifts_local_img( $img_path ) : '';

            $stock = (int) get_post_meta( $pid, '_gift_stock', true );

            // Color count from new structure
            $cv_raw     = get_post_meta( $pid, '_gift_color_variants', true );
            $color_count = 0;
            if ( $cv_raw ) {
                $cv = json_decode( $cv_raw, true );
                if ( is_array( $cv ) ) $color_count = count( $cv );
            }
            if ( ! $color_count ) {
                // Fallback: old _gift_variants
                $vraw = get_post_meta( $pid, '_gift_variants', true );
                if ( $vraw ) {
                    $v = json_decode( $vraw, true );
                    if ( is_array( $v ) ) $color_count = count( $v );
                }
            }
        ?>
        <a href="<?php the_permalink(); ?>" class="gc-product-card">
            <div class="gc-product-img">
                <?php if ( $img_url ) : ?>
                <img src="<?php echo esc_url( $img_url ); ?>" alt="<?php the_title_attribute(); ?>" loading="lazy">
                <?php endif; ?>
                <?php if ( $stock <= 0 ) : ?>
                <span class="gc-badge">Под заказ</span>
                <?php endif; ?>
                <?php if ( $color_count > 1 ) : ?>
                <span class="gc-colors-badge"><?php echo $color_count; ?> цвета</span>
                <?php endif; ?>
            </div>
            <div class="gc-product-body">
                <div class="gc-product-title"><?php the_title(); ?></div>
                <?php if ( $price > 0 ) : ?>
                <div class="gc-product-price">
                    от <?php echo number_format( $price, 0, '', ' ' ); ?> ₽
                    <span>/ шт.</span>
                </div>
                <?php else : ?>
                <div class="gc-product-price" style="color:#aaa; font-size:13px; font-weight:500;">
                    По запросу
                </div>
                <?php endif; ?>
            </div>
        </a>
        <?php endwhile; wp_reset_postdata(); ?>
    </div>

    <!-- Pagination -->
    <?php if ( $products_query->max_num_pages > 1 ) :
        $big = 999999999;
    ?>
    <div class="gc-pagination">
        <?php echo paginate_links( [
            'base'      => str_replace( $big, '%#%', esc_url( get_pagenum_link( $big ) ) ),
            'format'    => '?paged=%#%',
            'current'   => $paged,
            'total'     => $products_query->max_num_pages,
            'before_page_number' => '',
            'type'      => 'plain',
        ] ); ?>
    </div>
    <?php endif; ?>

    <?php elseif ( $show_products ) : ?>
    <div class="gc-empty">Товары в этой категории ещё не добавлены.</div>
    <?php endif; ?>

</section>

<?php get_footer(); ?>
