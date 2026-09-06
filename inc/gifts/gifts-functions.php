<?php
/**
 * Gifts.ru — регистрация CPT и таксономии
 */

define( 'GIFTS_CDN',  'https://files.gifts.ru/reviewer/' );
define( 'GIFTS_API',  'https://86664_xmlexport:130900Artem@api2.gifts.ru/export/v2/catalogue' );
define( 'GIFTS_DIR',  get_template_directory() . '/inc/gifts/' );

/* ── Custom Post Type: gift ─────────────────────────────────────────────── */
add_action( 'init', 'register_cpt_gift' );
function register_cpt_gift() {
    register_post_type( 'gift', [
        'labels' => [
            'name'               => 'Сувениры',
            'singular_name'      => 'Сувенир',
            'menu_name'          => 'Сувениры',
            'add_new_item'       => 'Добавить сувенир',
            'edit_item'          => 'Редактировать сувенир',
            'search_items'       => 'Поиск сувениров',
            'not_found'          => 'Сувениры не найдены',
        ],
        'public'             => true,
        'show_ui'            => true,
        'show_in_menu'       => true,
        'menu_icon'          => 'dashicons-products',
        'menu_position'      => 6,
        'supports'           => [ 'title', 'editor', 'thumbnail' ],
        'has_archive'        => false,
        'rewrite'            => [ 'slug' => 'souvenir', 'with_front' => false ],
        'query_var'          => true,
        'show_in_rest'       => false,
    ] );
}

/* ── Taxonomy: gift_cat ─────────────────────────────────────────────────── */
add_action( 'init', 'register_tax_gift_cat' );
function register_tax_gift_cat() {
    register_taxonomy( 'gift_cat', 'gift', [
        'labels' => [
            'name'              => 'Категории сувениров',
            'singular_name'     => 'Категория',
            'search_items'      => 'Поиск категорий',
            'all_items'         => 'Все категории',
            'parent_item'       => 'Родительская категория',
            'edit_item'         => 'Редактировать категорию',
            'update_item'       => 'Обновить категорию',
            'add_new_item'      => 'Добавить категорию',
            'menu_name'         => 'Категории',
        ],
        'hierarchical'      => true,
        'public'            => true,
        'show_ui'           => true,
        'show_admin_column' => true,
        'show_in_nav_menus' => true,
        'rewrite'           => [ 'slug' => 'souvenir/cat', 'with_front' => false ],
        'show_in_rest'      => false,
    ] );
}

/* ── Priority rewrite rules: taxonomy BEFORE CPT attachment rules ───────── */
// The CPT attachment rewrite pattern `souvenir/[^/]+/([^/]+)/?$` (position ~38)
// intercepts `souvenir/cat/gifts-XXXXX/` before the taxonomy rule (position ~48).
// Adding taxonomy rules with 'top' priority places them ahead of attachment rules.
add_action( 'init', function() {
    add_rewrite_rule(
        'souvenir/cat/([^/]+)/feed/(feed|rdf|rss|rss2|atom)/?$',
        'index.php?gift_cat=$matches[1]&feed=$matches[2]',
        'top'
    );
    add_rewrite_rule(
        'souvenir/cat/([^/]+)/(feed|rdf|rss|rss2|atom)/?$',
        'index.php?gift_cat=$matches[1]&feed=$matches[2]',
        'top'
    );
    add_rewrite_rule(
        'souvenir/cat/([^/]+)/embed/?$',
        'index.php?gift_cat=$matches[1]&embed=true',
        'top'
    );
    add_rewrite_rule(
        'souvenir/cat/([^/]+)/page/?([0-9]{1,})/?$',
        'index.php?gift_cat=$matches[1]&paged=$matches[2]',
        'top'
    );
    add_rewrite_rule(
        'souvenir/cat/([^/]+)/?$',
        'index.php?gift_cat=$matches[1]',
        'top'
    );
}, 20 );

/* ── Flush rewrite rules once after CPT registration ───────────────────── */
add_action( 'after_switch_theme', function() { flush_rewrite_rules(); } );

/* ── Helper: get gift product image URL (CDN) ────────────────────────────── */
function gifts_img_url( string $path, bool $big = false ): string {
    if ( empty( $path ) ) return '';
    if ( $big ) {
        $path = preg_replace( '/200x200/', '1000x1000', $path );
    }
    return GIFTS_CDN . ltrim( $path, '/' );
}

/**
 * Return a LOCAL (wp-uploads) URL for a CDN image path.
 * Downloads the image from the CDN on first call and caches it.
 * Falls back to the CDN URL if download fails.
 */
function gifts_local_img( string $path ): string {
    if ( empty( $path ) ) return '';

    // Always use 1000×1000 for display
    $path = preg_replace( '/200x200/', '1000x1000', $path );

    $upload   = wp_upload_dir();
    $sub_dir  = '/gifts/';
    $local_dir = $upload['basedir'] . $sub_dir;
    $base_name = basename( $path );
    $local_path = $local_dir . $base_name;
    $local_url  = $upload['baseurl'] . $sub_dir . $base_name;

    if ( ! file_exists( $local_path ) ) {
        wp_mkdir_p( $local_dir );
        $cdn_url = GIFTS_CDN . ltrim( $path, '/' );
        $ctx = stream_context_create( [
            'http' => [ 'timeout' => 15, 'ignore_errors' => true ],
            'ssl'  => [ 'verify_peer' => false ],
        ] );
        $data = @file_get_contents( $cdn_url, false, $ctx );
        if ( $data && strlen( $data ) > 500 ) {
            file_put_contents( $local_path, $data );
        } else {
            // Download failed — return CDN URL as fallback
            return GIFTS_CDN . ltrim( $path, '/' );
        }
    }

    return $local_url;
}

/* ── Helper: get variant list (decoded JSON) ────────────────────────────── */
function gifts_get_variants( int $post_id ): array {
    $raw = get_post_meta( $post_id, '_gift_variants', true );
    if ( empty( $raw ) ) return [];
    $arr = json_decode( $raw, true );
    return is_array( $arr ) ? $arr : [];
}

/* ── Helper: cheapest in-stock price for a product ─────────────────────── */
function gifts_get_min_price( int $post_id ): float {
    return (float) get_post_meta( $post_id, '_gift_price', true );
}

/* ── WP-Cron: daily stock update at 04:00 ──────────────────────────────── */
add_action( 'gifts_stock_update_hook', 'gifts_run_stock_update' );
function gifts_run_stock_update(): void {
    $file = get_template_directory() . '/inc/gifts/gifts-stock-update.php';
    if ( file_exists( $file ) ) {
        require_once $file;
    }
}

add_action( 'init', function () {
    if ( ! wp_next_scheduled( 'gifts_stock_update_hook' ) ) {
        // Schedule first run at next 04:00
        $tomorrow_4am = mktime( 4, 0, 0, date('n'), date('j') + 1 );
        wp_schedule_event( $tomorrow_4am, 'daily', 'gifts_stock_update_hook' );
    }
} );
