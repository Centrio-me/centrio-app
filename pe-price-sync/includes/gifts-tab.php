<?php
/**
 * pe-price-sync — вкладка "Сувениры (gifts.ru)"
 * Подключается из pe-price-sync.php
 */

if ( ! defined( 'ABSPATH' ) ) exit;

// ─── Progress transient key ───────────────────────────────────────────────────
define( 'GIFTS_PROGRESS_KEY', 'gifts_import_progress' );

// ─── Helpers ──────────────────────────────────────────────────────────────────

function gifts_admin_fetch( string $url, int $timeout = 120 ) {
    static $last = 0;
    $wait = 0.2 - ( microtime( true ) - $last );
    if ( $wait > 0 ) usleep( (int) ( $wait * 1_000_000 ) );

    $ctx = stream_context_create( [
        'http' => [ 'timeout' => $timeout, 'ignore_errors' => true ],
        'ssl'  => [ 'verify_peer' => false ],
    ] );
    $data = @file_get_contents( $url, false, $ctx );
    $last = microtime( true );
    return $data;
}

/**
 * Stream a large remote file directly to disk (no memory buffering).
 * Returns bytes written, or 0 on failure.
 */
function gifts_admin_stream_to_file( string $url, string $dest, int $timeout = 1800 ): int {
    $ctx = stream_context_create( [
        'http' => [ 'timeout' => $timeout, 'ignore_errors' => true ],
        'ssl'  => [ 'verify_peer' => false ],
    ] );
    $src = @fopen( $url, 'rb', false, $ctx );
    if ( ! $src ) return 0;

    $dst = @fopen( $dest, 'wb' );
    if ( ! $dst ) { fclose( $src ); return 0; }

    $bytes = 0;
    while ( ! feof( $src ) ) {
        $chunk  = fread( $src, 524288 ); // 512 KB chunks
        if ( $chunk === false ) break;
        fwrite( $dst, $chunk );
        $bytes += strlen( $chunk );
    }
    fclose( $src );
    fclose( $dst );
    return $bytes;
}

/**
 * Stream-read one <product> element (and its nested children).
 * Variants are stored in $d['variants'] as sub-arrays.
 * Images come from <small_image src="…"/> / <super_big_image src="…"/> attributes.
 */
function gifts_admin_read_product( XMLReader $r ): array {
    $d     = [];
    $depth = $r->depth;

    while ( $r->read() ) {
        if ( $r->nodeType === XMLReader::END_ELEMENT && $r->depth <= $depth ) break;
        if ( $r->nodeType !== XMLReader::ELEMENT ) continue;

        $tag = $r->localName;

        // Nested variant product (variants are children of their parent in this XML)
        if ( $tag === 'product' ) {
            $d['variants'][] = gifts_admin_read_product( $r );

        // Image in src attribute  (e.g. <small_image src="thumbnails/…"/>)
        // Store path only — gifts_img_url() in the theme adds the CDN prefix.
        } elseif ( $tag === 'small_image' || $tag === 'big_image' || $tag === 'super_big_image' ) {
            $src = $r->getAttribute( 'src' );
            if ( $src !== null && $src !== '' ) {
                $d['images'][] = ltrim( $src, '/' );
            }

        // Legacy text-content image tags
        } elseif ( in_array( $tag, [ 'image', 'img' ], true ) ) {
            $r->read();
            if ( $r->nodeType === XMLReader::TEXT ) $d['images'][] = trim( $r->value );

        } elseif ( $tag === 'images' ) {
            // container — descend naturally

        } elseif ( in_array( $tag, [ 'property', 'param' ], true ) ) {
            $pname = $r->getAttribute( 'name' ) ?? '';
            $r->read();
            if ( $pname !== '' && $r->nodeType === XMLReader::TEXT ) {
                $d['props'][ $pname ] = $r->value;
            }

        } elseif ( $tag === 'price' ) {
            // The <price> container can be either:
            //   Simple:    <price>149.00</price>
            //   Container: <price><product>6301</product><price>149.00</price><value>…</value><name>End-User</name></price>
            // In the container form, naively concatenating all text produces "6301149.00149.00End-User"
            // and (float) would return the product_id (6301), not the price.
            // Fix: capture only the inner <price> child's text when present; fall back to plain text for simple form.
            $rd              = $r->depth;
            $all_text        = '';
            $inner_price_val = '';
            $in_inner        = false;
            if ( ! $r->isEmptyElement ) {
                while ( $r->read() ) {
                    if ( $r->nodeType === XMLReader::ELEMENT && $r->localName === 'price' ) {
                        $in_inner = true;
                    } elseif ( $r->nodeType === XMLReader::END_ELEMENT && $r->localName === 'price' && $r->depth > $rd ) {
                        $in_inner = false;
                    } elseif ( $r->nodeType === XMLReader::TEXT || $r->nodeType === XMLReader::CDATA ) {
                        $all_text .= $r->value;
                        if ( $in_inner ) $inner_price_val .= $r->value;
                    }
                    if ( $r->nodeType === XMLReader::END_ELEMENT && $r->depth <= $rd ) break;
                }
            }
            // Prefer inner <price> text (container format); fall back to plain text (simple format)
            $price_str = $inner_price_val !== '' ? $inner_price_val : $all_text;
            if ( ! isset( $d['price'] ) ) $d['price'] = trim( $price_str );

        } else {
            // Read all text / CDATA content.
            // IMPORTANT: skip the inner loop for self-closing elements (e.g. <alerts/>, <video src="..."/>).
            // If we don't skip, the inner while would read PAST the parent's closing </product> tag and
            // swallow subsequent sibling products into the current product's variant list.
            $rd  = $r->depth;
            $val = '';
            if ( ! $r->isEmptyElement ) {
                while ( $r->read() ) {
                    if ( $r->nodeType === XMLReader::TEXT || $r->nodeType === XMLReader::CDATA ) {
                        $val .= $r->value;
                    }
                    if ( $r->nodeType === XMLReader::END_ELEMENT && $r->depth <= $rd ) break;
                }
            }
            if ( ! isset( $d[ $tag ] ) ) $d[ $tag ] = trim( $val );
        }
    }
    return $d;
}

// Write a progress line to the transient (for polling) + to the in-memory log
function gifts_progress_emit( string $line, array &$log, bool $flush = false ) {
    $log[] = $line;
    if ( $flush || count( $log ) % 50 === 0 ) {
        $progress = get_option( GIFTS_PROGRESS_KEY, [] );
        $progress['log']  = array_slice( $log, -300 ); // keep last 300 lines
        $progress['lines'] = count( $log );
        update_option( GIFTS_PROGRESS_KEY, $progress );
    }
}

// ─── Background job hooks (run inside wp-cron.php, separate PHP process) ─────
// Must be registered at top level so wp-cron.php picks them up.

add_action( 'gifts_bg_import', 'gifts_bg_run_import' );
add_action( 'gifts_bg_stock',  'gifts_bg_run_stock' );

function gifts_bg_run_import(): void {
    ignore_user_abort( true );
    set_time_limit( 0 );

    $log  = [];
    $emit = static function ( string $line, bool $flush = false ) use ( &$log ) {
        gifts_progress_emit( $line, $log, $flush );
    };
    $success = false;
    $err_msg = '';

    try {
        gifts_admin_do_import( $emit );
        $success = true;
    } catch ( Throwable $e ) {
        $err_msg = $e->getMessage();
        $emit( 'КРИТИЧЕСКАЯ ОШИБКА: ' . $err_msg, true );
    }

    update_option( GIFTS_PROGRESS_KEY, [
        'status'   => $success ? 'done' : 'error',
        'action'   => 'full_import',
        'finished' => date( 'Y-m-d H:i:s' ),
        'error'    => $err_msg,
        'log'      => $log,
        'lines'    => count( $log ),
    ] );
}

function gifts_bg_run_stock(): void {
    ignore_user_abort( true );
    set_time_limit( 0 );

    $log  = [];
    $emit = static function ( string $line, bool $flush = false ) use ( &$log ) {
        gifts_progress_emit( $line, $log, $flush );
    };
    $success = false;
    $err_msg = '';

    try {
        gifts_admin_do_stock( $emit );
        $success = true;
    } catch ( Throwable $e ) {
        $err_msg = $e->getMessage();
        $emit( 'КРИТИЧЕСКАЯ ОШИБКА: ' . $err_msg, true );
    }

    update_option( GIFTS_PROGRESS_KEY, [
        'status'   => $success ? 'done' : 'error',
        'action'   => 'stock_update',
        'finished' => date( 'Y-m-d H:i:s' ),
        'error'    => $err_msg,
        'log'      => $log,
        'lines'    => count( $log ),
    ] );
}

// ─── Helper: schedule + immediately spawn a cron event ───────────────────────

function gifts_spawn_bg_job( string $hook ): void {
    // Remove any stale pending instance of this hook
    wp_clear_scheduled_hook( $hook );
    // Schedule in the past so it's due immediately
    wp_schedule_single_event( time() - 1, $hook );
    // Remove the "doing_cron" lock so spawn_cron() isn't throttled
    delete_transient( 'doing_cron' );
    // Fire a non-blocking HTTP request to wp-cron.php (returns before cron finishes)
    spawn_cron();
}

// ─── AJAX: start full import ──────────────────────────────────────────────────

add_action( 'wp_ajax_gifts_import_run', function () {
    check_ajax_referer( 'pe_sync_nonce', 'nonce' );
    if ( ! current_user_can( 'manage_options' ) ) wp_die( 'Forbidden', 403 );

    // Don't double-start if already running
    $progress = get_option( GIFTS_PROGRESS_KEY, [] );
    if ( ( $progress['status'] ?? '' ) === 'running' ) {
        wp_send_json_success( [ 'started' => true ] );
        return;
    }

    // Mark as running so the first poll immediately sees it
    update_option( GIFTS_PROGRESS_KEY, [
        'status'  => 'running',
        'action'  => 'full_import',
        'started' => date( 'Y-m-d H:i:s' ),
        'log'     => [],
        'lines'   => 0,
    ] );

    // Launch background job via WP-Cron (separate PHP process, no nginx timeout)
    gifts_spawn_bg_job( 'gifts_bg_import' );

    // Return immediately — JS polls for progress
    wp_send_json_success( [ 'started' => true ] );
} );

// ─── AJAX: stock update only ──────────────────────────────────────────────────

add_action( 'wp_ajax_gifts_stock_run', function () {
    check_ajax_referer( 'pe_sync_nonce', 'nonce' );
    if ( ! current_user_can( 'manage_options' ) ) wp_die( 'Forbidden', 403 );

    $progress = get_option( GIFTS_PROGRESS_KEY, [] );
    if ( ( $progress['status'] ?? '' ) === 'running' ) {
        wp_send_json_success( [ 'started' => true ] );
        return;
    }

    update_option( GIFTS_PROGRESS_KEY, [
        'status'  => 'running',
        'action'  => 'stock_update',
        'started' => date( 'Y-m-d H:i:s' ),
        'log'     => [],
        'lines'   => 0,
    ] );

    gifts_spawn_bg_job( 'gifts_bg_stock' );

    wp_send_json_success( [ 'started' => true ] );
} );

// ─── AJAX: poll progress ──────────────────────────────────────────────────────

add_action( 'wp_ajax_gifts_import_poll', function () {
    check_ajax_referer( 'pe_sync_nonce', 'nonce' );
    if ( ! current_user_can( 'manage_options' ) ) wp_die( 'Forbidden', 403 );

    $progress = get_option( GIFTS_PROGRESS_KEY, null );
    if ( $progress === null ) {
        wp_send_json_success( [ 'status' => 'idle', 'log' => '', 'lines' => 0 ] );
        return;
    }

    wp_send_json_success( [
        'status'   => $progress['status']   ?? 'idle',
        'action'   => $progress['action']   ?? '',
        'started'  => $progress['started']  ?? '',
        'finished' => $progress['finished'] ?? '',
        'lines'    => $progress['lines']    ?? 0,
        'error'    => $progress['error']    ?? '',
        'log'      => implode( "\n", (array) ( $progress['log'] ?? [] ) ),
    ] );
} );

// ─── AJAX: reset progress (cancel marker) ────────────────────────────────────

add_action( 'wp_ajax_gifts_progress_reset', function () {
    check_ajax_referer( 'pe_sync_nonce', 'nonce' );
    if ( ! current_user_can( 'manage_options' ) ) wp_die( 'Forbidden', 403 );
    delete_option( GIFTS_PROGRESS_KEY );
    wp_send_json_success();
} );

// ─── IMPORT LOGIC ─────────────────────────────────────────────────────────────

function _gifts_recurse_cats( $pages, int $parent, array &$tm, array &$excl ): void {
    foreach ( $pages as $page ) {
        // XML field is <page_id>, not <id>
        $gid  = (int) ( $page->page_id ?? $page->id ?? $page['page_id'] ?? $page['id'] ?? 0 );
        $name = trim( (string) ( $page->name ?? '' ) );
        if ( ! $gid || $name === '' ) continue;

        if ( mb_stripos( $name, 'Маркетинговая поддержка' ) !== false ) {
            _gifts_collect_excl( $page, $excl );
            continue;
        }

        $slug = 'gifts-' . $gid;
        $ex   = get_term_by( 'slug', $slug, 'gift_cat' );
        if ( $ex ) {
            $tid = $ex->term_id;
            wp_update_term( $tid, 'gift_cat', [ 'name' => $name, 'parent' => $parent ] );
        } else {
            $res = wp_insert_term( $name, 'gift_cat', [ 'slug' => $slug, 'parent' => $parent ] );
            if ( is_wp_error( $res ) ) continue;
            $tid = $res['term_id'];
        }
        update_term_meta( $tid, '_gifts_page_id', $gid );
        $tm[ $gid ] = $tid;

        // Children are directly nested <page> elements (no <pages> wrapper)
        $children = $page->page ?? null;
        if ( $children ) _gifts_recurse_cats( $children, $tid, $tm, $excl );
    }
}

function _gifts_collect_excl( $page, array &$excl ): void {
    $gid = (int) ( $page->page_id ?? $page->id ?? $page['page_id'] ?? $page['id'] ?? 0 );
    if ( $gid ) $excl[] = $gid;
    $ch = $page->page ?? null;
    if ( $ch ) foreach ( $ch as $c ) _gifts_collect_excl( $c, $excl );
}

/**
 * Guess the best matching gift_cat term_id for a product groupname.
 * Uses Russian stem-based keyword overlap. Returns 0 if no confident match.
 *
 * @param string $groupname  Product group name from gifts.ru (e.g. "Футболка Imperial 190")
 * @param array  $terms      [ term_id => term_name ] for all gift_cat terms
 */
function _gifts_guess_term( string $groupname, array $terms ): int {
    if ( empty( $terms ) ) return 0;

    // Tokenize groupname into stems of ≥4 characters
    $words = preg_split( '/[\s,\/\(\)\-\.]+/u', mb_strtolower( $groupname, 'UTF-8' ) );
    $stems = [];
    foreach ( $words as $w ) {
        $len = mb_strlen( $w, 'UTF-8' );
        if ( $len < 4 ) continue;
        // Stem: drop last 2 chars (handles common Russian inflections), min 4
        $stems[] = mb_substr( $w, 0, max( 4, $len - 2 ), 'UTF-8' );
    }
    if ( empty( $stems ) ) return 0;

    $best_score = 0;
    $best_tid   = 0;

    foreach ( $terms as $tid => $name ) {
        $path_lower = mb_strtolower( $name, 'UTF-8' );
        $score      = 0;
        foreach ( $stems as $stem ) {
            if ( mb_strpos( $path_lower, $stem, 0, 'UTF-8' ) !== false ) {
                $score++;
            }
        }
        if ( $score > $best_score ) {
            $best_score = $score;
            $best_tid   = (int) $tid;
        }
    }

    // Require at least 1 stem hit; avoid assigning to totally unrelated categories
    return $best_score >= 1 ? $best_tid : 0;
}

function gifts_admin_do_import( callable $emit ): void {
    if ( ! defined( 'GIFTS_API' ) ) {
        throw new RuntimeException( 'GIFTS_API constant not defined. Проверьте что тема активна и gifts-functions.php подключён.' );
    }

    $emit( '=== Импорт gifts.ru начат ' . date( 'Y-m-d H:i:s' ) . ' ===', true );

    // ── Step 1: Categories ────────────────────────────────────────────────────
    $emit( '── Шаг 1: Загрузка категорий (treeWithoutProducts.xml) …' );
    $tree_raw = gifts_admin_fetch( GIFTS_API . '/treeWithoutProducts.xml' );

    if ( ! $tree_raw ) {
        throw new RuntimeException( 'Не удалось загрузить treeWithoutProducts.xml.' );
    }
    $emit( '  Размер: ' . number_format( strlen( $tree_raw ) ) . ' байт' );

    $tree = @simplexml_load_string( $tree_raw );
    if ( ! $tree ) {
        throw new RuntimeException( 'Не удалось разобрать treeWithoutProducts.xml' );
    }
    unset( $tree_raw );

    $term_map = [];
    $excluded = [];

    $root_page = $tree->page;
    $root      = $root_page->page ?? null;
    if ( ! $root ) $root = $tree->page;
    _gifts_recurse_cats( $root, 0, $term_map, $excluded );
    unset( $tree );

    update_option( 'gifts_term_map',       $term_map );
    update_option( 'gifts_excluded_pages', $excluded );
    $emit( '  Создано/обновлено категорий: ' . count( $term_map ), true );
    $emit( '  Исключено page_id: ' . count( $excluded ) );

    // ── Step 2: Download product.xml ──────────────────────────────────────────
    $emit( '── Шаг 2: Загрузка product.xml …', true );
    $excluded_set = array_flip( $excluded );

    $tmp_product = tempnam( sys_get_temp_dir(), 'gifts_prod_' );
    $emit( '  Скачивание product.xml (~91 МБ) …' );
    $bytes = gifts_admin_stream_to_file( GIFTS_API . '/product.xml', $tmp_product );
    if ( ! $bytes ) {
        @unlink( $tmp_product );
        throw new RuntimeException( 'Не удалось скачать product.xml.' );
    }
    $emit( '  Скачано: ' . number_format( $bytes ) . ' байт → ' . $tmp_product, true );

    // ── Step 3: Parse — two arrays in one XMLReader pass ─────────────────────
    // XML is FLAT: color-parent records (no main_product) and
    // size-variant records (have main_product) are top-level siblings.
    $emit( '── Шаг 3: Разбор product.xml …', true );

    $color_parents = [];   // [ product_id => data ]
    $size_variants = [];   // [ main_product_id => [ data, … ] ]
    $total_read    = 0;

    $r = new XMLReader();
    if ( ! @$r->open( $tmp_product ) ) {
        @unlink( $tmp_product );
        throw new RuntimeException( 'Не удалось открыть временный файл product.xml.' );
    }

    while ( $r->read() ) {
        if ( $r->nodeType !== XMLReader::ELEMENT || $r->localName !== 'product' ) continue;

        $p   = gifts_admin_read_product( $r );
        $gid = (int) ( $p['product_id'] ?? $p['id'] ?? 0 );
        if ( ! $gid ) continue;

        $total_read++;

        if ( ! empty( $p['main_product'] ) ) {
            // Size variant — linked to a color parent via main_product
            $mid = (int) $p['main_product'];
            $size_variants[ $mid ][] = $p;
        } else {
            // Color parent — has groupname, name, images, description
            $color_parents[ $gid ] = $p;
        }

        if ( $total_read % 5000 === 0 ) {
            $nv = 0;
            foreach ( $size_variants as $sv ) $nv += count( $sv );
            $emit( "  … прочитано {$total_read}: цветов=" . count( $color_parents ) . ", размеров={$nv}", true );
        }
    }
    $r->close();
    @unlink( $tmp_product );

    $total_sv = 0;
    foreach ( $size_variants as $sv ) $total_sv += count( $sv );
    $emit( "  Итого: {$total_read} записей (цветов=" . count( $color_parents ) . ", размеров={$total_sv})", true );

    // ── Step 4: Group by groupname → ONE WP post per product family ───────────
    $emit( '── Шаг 4: Группировка по groupname, сохранение …', true );

    // group_map: md5(groupname) → post_id  (for fast re-import lookup)
    $group_map = get_option( 'gifts_group_map', [] );
    // id_map: gifts product_id (color parent OR size variant) → post_id  (for stock updates)
    $id_map = get_option( 'gifts_id_map', [] );

    // Load all gift_cat terms once for keyword-based category matching fallback
    $all_gift_terms = get_terms( [
        'taxonomy'   => 'gift_cat',
        'hide_empty' => false,
        'fields'     => 'id=>name',
    ] );
    if ( is_wp_error( $all_gift_terms ) ) $all_gift_terms = [];

    // Build groups: groupname → [ color_parent_id, … ]
    $groups = [];
    foreach ( $color_parents as $gid => $p ) {
        $gn = trim( $p['groupname'] ?? $p['name'] ?? '' );
        if ( $gn === '' ) continue;
        $groups[ $gn ][] = $gid;
    }
    $emit( '  Уникальных товарных групп: ' . count( $groups ), true );

    $created = 0;
    $updated = 0;
    $skipped = 0;
    $cnt     = 0;

    // Reusable HTML allowed tags for wp_kses
    $allowed_html = [
        'p' => [], 'br' => [], 'ul' => [], 'ol' => [], 'li' => [],
        'strong' => [], 'em' => [], 'b' => [], 'i' => [],
        'div'   => [ 'id' => true, 'class' => true ],
        'table' => [ 'border' => true, 'cellpadding' => true, 'cellspacing' => true ],
        'thead' => [], 'tbody' => [], 'tr' => [ 'align' => true ],
        'td'    => [ 'align' => true, 'colspan' => true ], 'th' => [],
    ];

    // Canonical size order for sorting
    $size_order = [ 'XS' => 0, 'S' => 1, 'M' => 2, 'L' => 3,
                    'XL' => 4, '2XL' => 5, 'XXL' => 5, '3XL' => 6, 'XXXL' => 6 ];

    foreach ( $groups as $groupname => $color_gids ) {

        // Category exclusion (use page_id of first color)
        $first_cp = $color_parents[ $color_gids[0] ];
        $page_id  = (int) ( $first_cp['group'] ?? $first_cp['page_id'] ?? 0 );
        if ( isset( $excluded_set[ $page_id ] ) ) { $skipped++; continue; }

        // ── Build _gift_color_variants ─────────────────────────────────────────
        $color_variants = [];
        $all_prices     = [];
        $description    = '';
        $props          = [];
        $first_gift_id  = $color_gids[0];

        foreach ( $color_gids as $cgid ) {
            $cp        = $color_parents[ $cgid ];
            $full_name = trim( $cp['name'] ?? $groupname );

            // Extract color by stripping "Groupname, " prefix
            $color = $full_name;
            $pfx   = $groupname . ', ';
            if ( mb_strpos( $full_name, $pfx ) === 0 ) {
                $color = mb_substr( $full_name, mb_strlen( $pfx ) );
            }

            // Description: take from first color that has content
            if ( $description === '' && ! empty( $cp['content'] ) ) {
                $raw = html_entity_decode( $cp['content'], ENT_QUOTES, 'UTF-8' );
                $raw = preg_replace( '/<a\b[^>]*>(.*?)<\/a>/si', '$1', $raw );
                $raw = preg_replace( '/<img\b[^>]*\/?>/si',      '',   $raw );
                $description = wp_kses( $raw, $allowed_html );
            }

            // Characteristics: take from first color
            if ( empty( $props ) ) {
                foreach ( [ 'matherial', 'sourcecountry', 'product_size', 'barcode', 'vendor', 'vendorcode' ] as $f ) {
                    if ( ! empty( $cp[ $f ] ) ) $props[ $f ] = $cp[ $f ];
                }
            }

            // Sizes — nested variant records consumed by gifts_admin_read_product().
            // XML is NESTED: size variants are <product> children of the color parent,
            // so $size_variants[] is always empty; use $color_parents[$cgid]['variants'].
            $sizes = [];
            foreach ( $color_parents[ $cgid ]['variants'] ?? [] as $sv ) {
                $vid   = (int)   ( $sv['product_id'] ?? $sv['id'] ?? 0 );
                $price = (float) ( $sv['price']      ?? 0 );
                if ( $price > 0 ) $all_prices[] = $price;
                $sizes[] = [
                    'vid'       => $vid,
                    'size_code' => (string) ( $sv['size_code'] ?? '' ),
                    'price'     => $price,
                    'weight'    => (float) ( $sv['weight'] ?? 0 ),
                ];
            }

            // For products without size variants, use the color-parent's own price.
            // The price parser now correctly extracts the inner <price> value from
            // the container: <price><product>ID</product><price>AMOUNT</price>…</price>
            if ( empty( $sizes ) ) {
                $cp_price = (float) ( $cp['price'] ?? 0 );
                if ( $cp_price > 0 ) $all_prices[] = $cp_price;
            }

            // Sort sizes: S < M < L < XL … or natural for numeric codes
            usort( $sizes, static function ( $a, $b ) use ( $size_order ) {
                $ua = strtoupper( $a['size_code'] );
                $ub = strtoupper( $b['size_code'] );
                $oa = $size_order[ $ua ] ?? 99;
                $ob = $size_order[ $ub ] ?? 99;
                if ( $oa !== 99 || $ob !== 99 ) return $oa - $ob;
                return strnatcasecmp( $a['size_code'], $b['size_code'] );
            } );

            $color_variants[] = [
                'gifts_id' => $cgid,
                'color'    => $color,
                'name'     => $full_name,
                'images'   => $cp['images'] ?? [],
                'sizes'    => $sizes,
            ];
        }

        // ── Find or create WP post ────────────────────────────────────────────
        $gn_key  = md5( $groupname );
        $post_id = 0;
        if ( isset( $group_map[ $gn_key ] ) ) {
            $post_id = (int) $group_map[ $gn_key ];
            if ( ! get_post_status( $post_id ) ) {
                // Post was deleted externally — recreate
                unset( $group_map[ $gn_key ] );
                $post_id = 0;
            }
        }

        if ( $post_id ) {
            wp_update_post( [
                'ID'           => $post_id,
                'post_title'   => $groupname,
                'post_content' => $description,
            ] );
            $updated++;
        } else {
            $post_id = wp_insert_post( [
                'post_title'   => $groupname,
                'post_content' => $description,
                'post_status'  => 'publish',
                'post_type'    => 'gift',
            ] );
            if ( is_wp_error( $post_id ) ) { $skipped++; continue; }
            $group_map[ $gn_key ] = $post_id;
            $created++;
        }

        // ── Fill id_map for ALL color parents + size variants of this group ───
        foreach ( $color_gids as $cgid ) {
            $id_map[ $cgid ] = $post_id;
            // Size variants are nested inside color_parents (XML is NESTED, not flat)
            foreach ( $color_parents[ $cgid ]['variants'] ?? [] as $sv ) {
                $vid = (int) ( $sv['product_id'] ?? $sv['id'] ?? 0 );
                if ( $vid ) $id_map[ $vid ] = $post_id;
            }
        }

        // ── Save meta ─────────────────────────────────────────────────────────
        $min_price  = $all_prices ? min( $all_prices ) : 0.0;
        $main_image = $color_variants[0]['images'][0] ?? '';

        update_post_meta( $post_id, '_gift_groupname',      $groupname );
        update_post_meta( $post_id, '_gifts_id',            $first_gift_id );
        update_post_meta( $post_id, '_gifts_page_id',       $page_id );
        update_post_meta( $post_id, '_gift_price',          $min_price );
        update_post_meta( $post_id, '_gift_image',          $main_image );
        update_post_meta( $post_id, '_gift_color_variants',
            json_encode( $color_variants, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES ) );
        if ( $props ) {
            update_post_meta( $post_id, '_gift_props',
                json_encode( $props, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES ) );
        }
        // Clear legacy meta keys from old import format
        delete_post_meta( $post_id, '_gift_variants' );
        delete_post_meta( $post_id, '_gift_images' );

        if ( isset( $term_map[ $page_id ] ) ) {
            // Direct mapping via tree page_id — preferred
            wp_set_post_terms( $post_id, [ $term_map[ $page_id ] ], 'gift_cat' );
        } elseif ( ! empty( $all_gift_terms ) ) {
            // Fallback: keyword-based match between groupname and gift_cat term names.
            // gifts.ru API exports use separate ID namespaces for product groups (36xxx)
            // and tree pages (1104xxx), so the direct lookup above rarely succeeds.
            $guessed_tid = _gifts_guess_term( $groupname, $all_gift_terms );
            if ( $guessed_tid ) {
                wp_set_post_terms( $post_id, [ $guessed_tid ], 'gift_cat' );
            }
        }

        // Free processed data to reduce peak memory usage
        foreach ( $color_gids as $cgid ) {
            unset( $color_parents[ $cgid ], $size_variants[ $cgid ] );
        }

        $cnt++;
        if ( $cnt % 100 === 0 ) {
            update_option( 'gifts_id_map',    $id_map );
            update_option( 'gifts_group_map', $group_map );
            $emit( "  … {$cnt} групп (создано: {$created}, обновлено: {$updated}, пропущено: {$skipped})", true );
            gc_collect_cycles();
        }
    }

    update_option( 'gifts_id_map',    $id_map );
    update_option( 'gifts_group_map', $group_map );
    $emit( "  Итого: групп={$cnt}, создано={$created}, обновлено={$updated}, пропущено={$skipped}", true );

    // ── Step 5: Stock ─────────────────────────────────────────────────────────
    $emit( '── Шаг 5: Загрузка остатков (stock.xml) …', true );
    gifts_admin_do_stock( $emit, $id_map );

    update_option( 'gifts_last_import', date( 'Y-m-d H:i:s' ) );
    $emit( '═══════════════════════════════════════' );
    $emit( '✅ Импорт завершён: ' . $created . ' создано, ' . $updated . ' обновлено', true );
}

// ─── STOCK UPDATE LOGIC ───────────────────────────────────────────────────────

function gifts_admin_do_stock( callable $emit, array $id_map = [] ): void {
    if ( ! defined( 'GIFTS_API' ) ) {
        throw new RuntimeException( 'GIFTS_API constant not defined.' );
    }
    if ( empty( $id_map ) ) $id_map = get_option( 'gifts_id_map', [] );
    if ( empty( $id_map ) ) {
        throw new RuntimeException( 'Карта ID пуста — сначала запустите полный импорт.' );
    }

    $emit( '=== Обновление остатков начато ' . date( 'Y-m-d H:i:s' ) . ' ===' );
    $emit( '  Записей в карте: ' . count( $id_map ) );

    $raw = gifts_admin_fetch( GIFTS_API . '/stock.xml', 120 );
    if ( ! $raw ) {
        throw new RuntimeException( 'Не удалось загрузить stock.xml' );
    }
    $emit( '  Размер: ' . number_format( strlen( $raw ) ) . ' байт' );

    $xml = @simplexml_load_string( $raw );
    unset( $raw );
    if ( ! $xml ) {
        throw new RuntimeException( 'Не удалось разобрать stock.xml' );
    }

    // XML: <doct><stock><product_id>…</product_id><amount>…</amount></stock>…
    // Each <stock> entry is a single size-variant (identified by product_id).
    // We accumulate per-post maps: post_id → { variant_id → qty }
    $items       = $xml->stock ?? $xml->product ?? null;
    $post_stocks = [];   // [ post_id => [ variant_id => qty ] ]
    $matched     = 0;
    $unmatched   = 0;

    if ( $items ) {
        foreach ( $items as $sp ) {
            $gid = (int) ( $sp->product_id ?? $sp->id ?? $sp['product_id'] ?? $sp['id'] ?? 0 );
            $qty = (int) ( $sp->amount ?? $sp->free ?? $sp->quantity ?? $sp->count ?? 0 );
            if ( ! $gid ) continue;

            if ( isset( $id_map[ $gid ] ) && $id_map[ $gid ] ) {
                $post_id = (int) $id_map[ $gid ];
                $post_stocks[ $post_id ][ $gid ] = $qty;
                $matched++;
            } else {
                $unmatched++;
            }
        }
    }

    // Write per-post: full variant→qty map + summed total
    $posts_updated = 0;
    foreach ( $post_stocks as $post_id => $stock_map ) {
        $total = array_sum( $stock_map );
        update_post_meta( $post_id, '_gift_stock_map',
            json_encode( $stock_map, JSON_FORCE_OBJECT | JSON_UNESCAPED_UNICODE ) );
        update_post_meta( $post_id, '_gift_stock', $total );
        $posts_updated++;
    }

    update_option( 'gifts_last_stock_update', date( 'Y-m-d H:i:s' ) );
    $emit( "✅ Остатки обновлены: {$posts_updated} постов, {$matched} вариантов (нераспознано: {$unmatched})", true );
}

// ─── TAB HTML ─────────────────────────────────────────────────────────────────

function gifts_render_tab(): void {
    $last_import       = get_option( 'gifts_last_import', '' );
    $last_stock        = get_option( 'gifts_last_stock_update', '' );
    $id_map            = get_option( 'gifts_id_map', [] );
    $product_count     = count( $id_map );
    $term_count        = count( get_option( 'gifts_term_map', [] ) );
    $progress          = get_option( GIFTS_PROGRESS_KEY, null );
    $is_running        = ( $progress['status'] ?? '' ) === 'running';
    ?>
    <div id="tab-gifts" class="pe-tab-panel" style="display:none">

        <!-- Status card -->
        <div class="gifts-status-card">
            <div class="gifts-status-item">
                <span class="gifts-status-label">Последний импорт</span>
                <span class="gifts-status-value"><?php echo $last_import ? esc_html( $last_import ) : '—'; ?></span>
            </div>
            <div class="gifts-status-item">
                <span class="gifts-status-label">Последнее обновление остатков</span>
                <span class="gifts-status-value"><?php echo $last_stock ? esc_html( $last_stock ) : '—'; ?></span>
            </div>
            <div class="gifts-status-item">
                <span class="gifts-status-label">Товаров в базе</span>
                <span class="gifts-status-value"><?php echo number_format( $product_count ); ?></span>
            </div>
            <div class="gifts-status-item">
                <span class="gifts-status-label">Категорий</span>
                <span class="gifts-status-value"><?php echo number_format( $term_count ); ?></span>
            </div>
        </div>

        <!-- Actions -->
        <div class="gifts-actions">
            <button id="btn-gifts-import" class="button button-hero button-primary gifts-run-btn"
                    <?php echo $is_running ? 'disabled' : ''; ?>>
                📦 Полный импорт
            </button>
            <button id="btn-gifts-stock" class="button button-secondary gifts-run-btn"
                    <?php echo $is_running || ! $product_count ? 'disabled' : ''; ?>>
                🔄 Обновить остатки
            </button>
            <?php if ( $is_running ) : ?>
            <span class="gifts-running-badge">⏳ Выполняется…</span>
            <?php endif; ?>
        </div>

        <?php if ( ! defined( 'GIFTS_API' ) ) : ?>
        <div class="notice notice-error inline" style="margin:10px 0">
            <p><strong>Ошибка:</strong> GIFTS_API не определён. Убедитесь, что тема активна и <code>gifts-functions.php</code> подключён.</p>
        </div>
        <?php endif; ?>

        <!-- Progress -->
        <div id="gifts-progress-wrap" style="margin-top:16px; <?php echo ( $progress && $product_count ) || $is_running ? '' : 'display:none'; ?>">
            <div id="gifts-progress-bar"
                 style="background:#f0f0f1; padding:8px 12px; border-left:4px solid #2271b1; font-weight:600; margin-bottom:4px;">
                <?php
                if ( $is_running ) {
                    echo '⏳ Выполняется…';
                } elseif ( ( $progress['status'] ?? '' ) === 'done' ) {
                    echo '✅ Завершено: ' . esc_html( $progress['finished'] ?? '' );
                } elseif ( ( $progress['status'] ?? '' ) === 'error' ) {
                    echo '❌ Ошибка: ' . esc_html( $progress['error'] ?? '' );
                }
                ?>
            </div>
            <div id="gifts-log"
                 style="background:#1e1e1e; color:#d4d4d4; padding:15px; font-family:monospace; font-size:12px;
                        min-height:120px; max-height:600px; overflow-y:auto; white-space:pre-wrap;"><?php
                if ( $progress ) echo esc_html( implode( "\n", (array) ( $progress['log'] ?? [] ) ) );
            ?></div>
        </div>

    </div>

    <style>
    .pe-tab-nav { display:flex; gap:0; margin-bottom:0; border-bottom:1px solid #c3c4c7; }
    .pe-tab-btn {
        padding:10px 20px; cursor:pointer; border:1px solid transparent;
        border-bottom:none; margin-bottom:-1px; background:#f0f0f1;
        font-size:14px; font-weight:600; color:#555;
    }
    .pe-tab-btn.active { background:#fff; border-color:#c3c4c7; color:#1d2327; }
    .pe-tab-btn:hover:not(.active) { background:#e8e8e8; }
    .pe-tab-panel { padding-top:20px; }

    .gifts-status-card {
        display:flex; gap:24px; flex-wrap:wrap;
        background:#fff; border:1px solid #c3c4c7; border-radius:4px;
        padding:16px 20px; margin-bottom:20px; max-width:800px;
    }
    .gifts-status-item { display:flex; flex-direction:column; gap:2px; }
    .gifts-status-label { font-size:11px; color:#646970; text-transform:uppercase; letter-spacing:.5px; }
    .gifts-status-value { font-size:18px; font-weight:700; color:#1d2327; }

    .gifts-actions { display:flex; align-items:center; gap:12px; margin-bottom:16px; }
    .gifts-running-badge { font-size:13px; color:#9c5700; font-weight:600; }

    #gifts-log { line-height:1.5; }
    </style>
    <?php
}
